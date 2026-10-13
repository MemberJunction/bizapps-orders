-- =============================================================================
-- PostgreSQL counterpart of V202610091200__v5.30.x__Guard_Triggers_Throw_Without_Rollback.sql
-- =============================================================================
-- The T-SQL file recreates eight guard triggers without their ROLLBACK
-- TRANSACTION lines. Postgres has no such problem to fix: a trigger cannot
-- end the transaction, and RAISE EXCEPTION aborts the statement and leaves the
-- transaction for the caller to roll back. This file writes the same eight
-- guards for Postgres, with every check, condition, message and order kept.
--
-- Hand-written: `mj sql-convert` does not translate T-SQL triggers.
--
-- HOW THE T-SQL MAPS
--   * T-SQL triggers fire once per statement with `inserted` and `deleted`
--     pseudo-tables. Each guard here is a statement-level AFTER trigger whose
--     transition tables carry the same names, so the checks read the same.
--   * Postgres does not allow transition tables on a trigger with more than one
--     event, so a guard on UPDATE and DELETE is two triggers sharing one
--     function; the function branches on TG_OP.
--   * THROW <n>, '<message>' becomes RAISE EXCEPTION with the same message and
--     the T-SQL error number in DETAIL (SQLSTATE P0001).
--   * EXISTS (SELECT a EXCEPT SELECT b) becomes a IS DISTINCT FROM b, and
--     EXISTS (SELECT a INTERSECT SELECT b) becomes a IS NOT DISTINCT FROM b.
--     ISNULL becomes COALESCE, TOP 1 becomes LIMIT 1, DATEDIFF_BIG(MICROSECOND)
--     becomes the epoch difference in microseconds. Plain <> comparisons stay
--     <>, so a NULL on either side still passes, as it does in T-SQL.
--   * trg_OrderLineProgressMeasurement_Immutable skips the nested UPDATE that
--     MJ's T-SQL __mj_UpdatedAt trigger issues. On Postgres MJ stamps
--     __mj_UpdatedAt in a BEFORE trigger with no second UPDATE, so there is
--     nothing to skip.
--
-- The orders tables have no Postgres baseline in this repository yet; these
-- guards apply once that baseline exists.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- trg_OrderHeader_ImmutableAfterConfirm (AFTER UPDATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderHeader_ImmutableAfterConfirm"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- Every check below needs a prior row that is Confirmed, booked, or carries
    -- a snapshot. A write to draft orders only stops here.
    IF NOT EXISTS (
        SELECT 1
        FROM deleted
        WHERE "Status" = 'Confirmed'
           OR "ConfirmedAt" IS NOT NULL
           OR "BillToAddressSnapshot" IS NOT NULL
           OR "ShipToAddressSnapshot" IS NOT NULL
    ) THEN
        RETURN NULL;
    END IF;

    -- 51014: Status never leaves Confirmed. Corrections go through a reversal order.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" = 'Confirmed'
          AND i."Status" <> 'Confirmed'
    ) THEN
        RAISE EXCEPTION 'OrderHeader.Status cannot leave Confirmed (the order is booked under journal entries). Use a reversal order.'
            USING DETAIL = 'error 51014';
    END IF;

    -- 51013: the booked sale: who sold, to whom, when, and what kind of order it is.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" = 'Confirmed'
          AND (
            i."OrderDate" <> d."OrderDate" OR
            i."CompanyID" <> d."CompanyID" OR
            i."OrderType" <> d."OrderType" OR
            i."ReversesOrderHeaderID" IS DISTINCT FROM d."ReversesOrderHeaderID" OR
            -- Bill-to: set-once. An empty party may be filled; a set one may not change.
            (d."BillToOrganizationID" IS NOT NULL
                AND i."BillToOrganizationID" IS DISTINCT FROM d."BillToOrganizationID") OR
            (d."BillToPersonID" IS NOT NULL
                AND i."BillToPersonID" IS DISTINCT FROM d."BillToPersonID")
          )
    ) THEN
        RAISE EXCEPTION 'OrderHeader OrderDate, CompanyID, OrderType, ReversesOrderHeaderID and a set bill-to party cannot be changed once the order is Confirmed. Use a reversal order.'
            USING DETAIL = 'error 51013';
    END IF;

    -- 51015: the order keeps the address it was sold to. The snapshot conditions
    -- do not depend on status: a written snapshot is final even if the order's
    -- status were moved by direct SQL.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE (
                d."Status" = 'Confirmed'
                AND (
                    (d."BillToAddressID" IS NOT NULL
                        AND i."BillToAddressID" IS DISTINCT FROM d."BillToAddressID") OR
                    (d."ShipToAddressID" IS NOT NULL
                        AND i."ShipToAddressID" IS DISTINCT FROM d."ShipToAddressID") OR
                    (d."BillToAddressID" IS NULL AND i."BillToAddressID" IS NOT NULL
                        AND i."BillToAddressSnapshot" IS NULL) OR
                    (d."ShipToAddressID" IS NULL AND i."ShipToAddressID" IS NOT NULL
                        AND i."ShipToAddressSnapshot" IS NULL)
                )
              )
           OR (d."BillToAddressSnapshot" IS NOT NULL
                AND i."BillToAddressSnapshot" IS DISTINCT FROM d."BillToAddressSnapshot")
           OR (d."ShipToAddressSnapshot" IS NOT NULL
                AND i."ShipToAddressSnapshot" IS DISTINCT FROM d."ShipToAddressSnapshot")
    ) THEN
        RAISE EXCEPTION 'OrderHeader bill-to and ship-to addresses cannot be replaced once the order is Confirmed, and an empty one can be filled only together with its snapshot; the order keeps the address it was sold to. Use a reversal order.'
            USING DETAIL = 'error 51015';
    END IF;

    -- 51017: who confirmed the order is written once, by the booking save. An
    -- order booked before the column existed keeps NULL.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."ConfirmedAt" IS NOT NULL
          AND i."ConfirmedByUserID" IS DISTINCT FROM d."ConfirmedByUserID"
    ) THEN
        RAISE EXCEPTION 'OrderHeader.ConfirmedByUserID cannot be changed once the order is booked: it records who confirmed the order, and is written only by the booking save.'
            USING DETAIL = 'error 51017';
    END IF;

    -- 51018: payment terms are a commercial concession. The approval applies the
    -- change in its own transaction: the concession is saved Approved, then the
    -- header is updated, so the concession is visible here. Matching the LATEST
    -- approved Terms concession, not any, keeps an old approval from being
    -- replayed: once a later change is approved, an earlier one no longer matches.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" = 'Confirmed'
          AND i."PaymentTermsTypeID" IS DISTINCT FROM d."PaymentTermsTypeID"
          AND NOT EXISTS (
              SELECT 1
              FROM (
                  SELECT c."PriorPaymentTermsTypeID", c."NewPaymentTermsTypeID"
                  FROM "${flyway:defaultSchema}"."OrderConcession" c
                  WHERE c."OrderHeaderID" = d."ID"
                    AND c."DeliveryForm" = 'Terms'
                    AND c."Status" = 'Approved'
                  ORDER BY c."DecidedAt" DESC, c."ID" DESC
                  LIMIT 1
              ) latest
              WHERE latest."PriorPaymentTermsTypeID" IS NOT DISTINCT FROM d."PaymentTermsTypeID"
                AND latest."NewPaymentTermsTypeID" = i."PaymentTermsTypeID"
          )
    ) THEN
        RAISE EXCEPTION 'OrderHeader.PaymentTermsTypeID cannot be changed once the order is Confirmed except by an approved Terms concession. Use Orders.AmendArrangement.'
            USING DETAIL = 'error 51018';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderHeader_ImmutableAfterConfirm" ON "${flyway:defaultSchema}"."OrderHeader";
CREATE TRIGGER "trg_OrderHeader_ImmutableAfterConfirm"
    AFTER UPDATE ON "${flyway:defaultSchema}"."OrderHeader"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderHeader_ImmutableAfterConfirm"();


-- -----------------------------------------------------------------------------
-- trg_OrderLine_ImmutableAfterConfirm (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderLine_ImmutableAfterConfirm"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- 51002: DELETE. Block if any deleted line belongs to a Confirmed order.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN "${flyway:defaultSchema}"."OrderHeader" o ON o."ID" = d."OrderHeaderID"
            WHERE o."Status" = 'Confirmed'
        ) THEN
            RAISE EXCEPTION 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.'
                USING DETAIL = 'error 51002';
        END IF;
        RETURN NULL;
    END IF;

    -- 51003: UPDATE. The frozen columns on lines of Confirmed orders.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        JOIN "${flyway:defaultSchema}"."OrderHeader" o ON o."ID" = d."OrderHeaderID"
        WHERE o."Status" = 'Confirmed'
          AND (
            i."ProductID"      <> d."ProductID"      OR
            i."CompanyID"      <> d."CompanyID"      OR
            i."Quantity"       <> d."Quantity"       OR
            i."UnitPrice"      <> d."UnitPrice"      OR
            i."DiscountPct"    <> d."DiscountPct"    OR
            i."LineTax"        <> d."LineTax"        OR
            COALESCE(i."LineTotalNet",   0) <> COALESCE(d."LineTotalNet",   0) OR
            COALESCE(i."LineTotalGross", 0) <> COALESCE(d."LineTotalGross", 0)
          )
    ) THEN
        RAISE EXCEPTION 'OrderLine financial columns and selling company cannot be changed once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.'
            USING DETAIL = 'error 51003';
    END IF;

    -- 51016: UPDATE. The line keeps the ship-to address it was sold to.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        JOIN "${flyway:defaultSchema}"."OrderHeader" o ON o."ID" = d."OrderHeaderID"
        WHERE (
                o."Status" = 'Confirmed'
                AND (
                    (d."ShipToAddressID" IS NOT NULL
                        AND i."ShipToAddressID" IS DISTINCT FROM d."ShipToAddressID") OR
                    (d."ShipToAddressID" IS NULL AND i."ShipToAddressID" IS NOT NULL
                        AND i."ShipToAddressSnapshot" IS NULL)
                )
              )
           OR (d."ShipToAddressSnapshot" IS NOT NULL
                AND i."ShipToAddressSnapshot" IS DISTINCT FROM d."ShipToAddressSnapshot")
    ) THEN
        RAISE EXCEPTION 'OrderLine ship-to address cannot be replaced once its order is Confirmed, and an empty one can be filled only together with its snapshot; the line keeps the address it was sold to. Use a reversal order.'
            USING DETAIL = 'error 51016';
    END IF;

    -- 51008: UPDATE. JournalEntryID is the per-line booking record: NULL→value
    -- once, never cleared or replaced (any status). Corrections go through a
    -- reversal order, not by re-pointing the booked entry.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."JournalEntryID" IS NOT NULL
          AND (i."JournalEntryID" IS NULL OR i."JournalEntryID" <> d."JournalEntryID")
    ) THEN
        RAISE EXCEPTION 'OrderLine.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.'
            USING DETAIL = 'error 51008';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderLine_ImmutableAfterConfirm" ON "${flyway:defaultSchema}"."OrderLine";
CREATE TRIGGER "trg_OrderLine_ImmutableAfterConfirm"
    AFTER UPDATE ON "${flyway:defaultSchema}"."OrderLine"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderLine_ImmutableAfterConfirm"();

DROP TRIGGER IF EXISTS "trg_OrderLine_ImmutableAfterConfirm_Delete" ON "${flyway:defaultSchema}"."OrderLine";
CREATE TRIGGER "trg_OrderLine_ImmutableAfterConfirm_Delete"
    AFTER DELETE ON "${flyway:defaultSchema}"."OrderLine"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderLine_ImmutableAfterConfirm"();


-- -----------------------------------------------------------------------------
-- trg_PaymentHeader_ImmutableAfterCapture (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentHeader_ImmutableAfterCapture"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- DELETE: block once captured+ (Pending/Failed payments may be deleted)
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM deleted WHERE "Status" IN ('Captured','Refunded','Disputed')) THEN
            RAISE EXCEPTION 'Payment cannot be deleted once Captured. Use a reversal payment (Refund/Chargeback) instead.'
                USING DETAIL = 'error 51004';
        END IF;
        RETURN NULL;
    END IF;

    -- UPDATE: frozen financial fields once the PREVIOUS status was Captured+
    -- (the capture transition itself may set them in the same statement).
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" IN ('Captured','Refunded','Disputed')
          AND (
            i."Amount"               <> d."Amount"               OR
            i."ProcessingFeeAmount"  <> d."ProcessingFeeAmount"  OR
            COALESCE(i."NetAmount", 0) <> COALESCE(d."NetAmount", 0) OR
            i."PaymentTypeID"        <> d."PaymentTypeID"        OR
            i."PaymentDate"          <> d."PaymentDate"          OR
            i."ReceivingCompanyID"   <> d."ReceivingCompanyID"   OR
            COALESCE(i."BillToOrganizationID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."BillToOrganizationID", '00000000-0000-0000-0000-000000000000')
         OR COALESCE(i."BillToPersonID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."BillToPersonID", '00000000-0000-0000-0000-000000000000')
          )
    ) THEN
        RAISE EXCEPTION 'Payment financial fields (Amount/Fees/PaymentType/PaymentDate/ReceivingCompanyID/Customer) are frozen once Captured. Use a reversal payment.'
            USING DETAIL = 'error 51005';
    END IF;

    -- JournalEntryID: never cleared or replaced once set (any status)
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."JournalEntryID" IS NOT NULL
          AND (i."JournalEntryID" IS NULL OR i."JournalEntryID" <> d."JournalEntryID")
    ) THEN
        RAISE EXCEPTION 'Payment.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal payment.'
            USING DETAIL = 'error 51006';
    END IF;

    -- Status may not regress out of a terminal/locked state
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE (d."Status" = 'Captured'  AND i."Status" IN ('Pending','Failed'))
           OR (d."Status" = 'Refunded'  AND i."Status" <> 'Refunded')
           OR (d."Status" = 'Disputed'  AND i."Status" NOT IN ('Disputed','Refunded'))
    ) THEN
        RAISE EXCEPTION 'Payment.Status cannot regress (Captured may only advance to Refunded/Disputed; Refunded is terminal).'
            USING DETAIL = 'error 51007';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_PaymentHeader_ImmutableAfterCapture" ON "${flyway:defaultSchema}"."PaymentHeader";
CREATE TRIGGER "trg_PaymentHeader_ImmutableAfterCapture"
    AFTER UPDATE ON "${flyway:defaultSchema}"."PaymentHeader"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentHeader_ImmutableAfterCapture"();

DROP TRIGGER IF EXISTS "trg_PaymentHeader_ImmutableAfterCapture_Delete" ON "${flyway:defaultSchema}"."PaymentHeader";
CREATE TRIGGER "trg_PaymentHeader_ImmutableAfterCapture_Delete"
    AFTER DELETE ON "${flyway:defaultSchema}"."PaymentHeader"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentHeader_ImmutableAfterCapture"();


-- -----------------------------------------------------------------------------
-- trg_PaymentLine_ImmutableAfterCapture (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentLine_ImmutableAfterCapture"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- DELETE: block if any deleted line belongs to a Captured+ payment
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN "${flyway:defaultSchema}"."PaymentHeader" p ON p."ID" = d."PaymentHeaderID"
            WHERE p."Status" IN ('Captured','Refunded','Disputed')
        ) THEN
            RAISE EXCEPTION 'PaymentLine cannot be deleted once its payment is Captured (the allocation is booked under a journal entry). Use a reversal payment or an account-credit transfer.'
                USING DETAIL = 'error 51010';
        END IF;
        RETURN NULL;
    END IF;

    -- UPDATE: block changes to what the allocation MEANS on a Captured+ payment.
    -- BookedAt is deliberately absent: it is stamped by the booking pass itself,
    -- inside the same transaction that captures.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        JOIN "${flyway:defaultSchema}"."PaymentHeader" p ON p."ID" = d."PaymentHeaderID"
        WHERE p."Status" IN ('Captured','Refunded','Disputed')
          AND (
            i."Amount"        <> d."Amount"        OR
            i."OrderHeaderID" <> d."OrderHeaderID" OR
            COALESCE(i."OrderLineID", '00000000-0000-0000-0000-000000000000')
              <> COALESCE(d."OrderLineID", '00000000-0000-0000-0000-000000000000')
          )
    ) THEN
        RAISE EXCEPTION 'PaymentLine allocation fields (Amount/OrderHeaderID/OrderLineID) are frozen once the payment is Captured. Use a reversal payment or an account-credit transfer.'
            USING DETAIL = 'error 51011';
    END IF;

    -- BookedAt: NULL→value once, never cleared or replaced (any status). Same rule
    -- as OrderLine.JournalEntryID, and for the same reason — it is the idempotency
    -- key that stops a second set of entries being written for the same allocation.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."BookedAt" IS NOT NULL
          AND (i."BookedAt" IS NULL OR i."BookedAt" <> d."BookedAt")
    ) THEN
        RAISE EXCEPTION 'PaymentLine.BookedAt cannot be cleared or replaced once set — it is what stops the allocation being booked twice.'
            USING DETAIL = 'error 51012';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_PaymentLine_ImmutableAfterCapture" ON "${flyway:defaultSchema}"."PaymentLine";
CREATE TRIGGER "trg_PaymentLine_ImmutableAfterCapture"
    AFTER UPDATE ON "${flyway:defaultSchema}"."PaymentLine"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentLine_ImmutableAfterCapture"();

DROP TRIGGER IF EXISTS "trg_PaymentLine_ImmutableAfterCapture_Delete" ON "${flyway:defaultSchema}"."PaymentLine";
CREATE TRIGGER "trg_PaymentLine_ImmutableAfterCapture_Delete"
    AFTER DELETE ON "${flyway:defaultSchema}"."PaymentLine"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentLine_ImmutableAfterCapture"();


-- -----------------------------------------------------------------------------
-- trg_PaymentDetail_Immutable (AFTER UPDATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentDetail_Immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i."ID" = d."ID"
        WHERE COALESCE(i."PaymentTypeID",'00000000-0000-0000-0000-000000000000') <> COALESCE(d."PaymentTypeID",'00000000-0000-0000-0000-000000000000')
           OR COALESCE(i."CompanyID",'00000000-0000-0000-0000-000000000000')     <> COALESCE(d."CompanyID",'00000000-0000-0000-0000-000000000000')
           OR COALESCE(i."ProviderCustomerRef",'')   <> COALESCE(d."ProviderCustomerRef",'')
           OR COALESCE(i."ProviderInstrumentRef",'') <> COALESCE(d."ProviderInstrumentRef",'')
           OR COALESCE(i."Brand",'')          <> COALESCE(d."Brand",'')
           OR COALESCE(i."Last4",'')          <> COALESCE(d."Last4",'')
           OR COALESCE(i."ExpiryMonth",-1)    <> COALESCE(d."ExpiryMonth",-1)
           OR COALESCE(i."ExpiryYear",-1)     <> COALESCE(d."ExpiryYear",-1)
           OR COALESCE(i."BankName",'')       <> COALESCE(d."BankName",'')
           OR COALESCE(i."RoutingLast4",'')   <> COALESCE(d."RoutingLast4",'')
           OR COALESCE(i."AccountLast4",'')   <> COALESCE(d."AccountLast4",'')
           OR COALESCE(i."ReferenceNumber",'') <> COALESCE(d."ReferenceNumber",'')
           OR COALESCE(i."StoredValueAccountID",'00000000-0000-0000-0000-000000000000') <> COALESCE(d."StoredValueAccountID",'00000000-0000-0000-0000-000000000000')
    ) THEN
        RAISE EXCEPTION 'PaymentDetail instrument fields are immutable once created. A payment instrument is a point-in-time snapshot; create a NEW PaymentDetail row instead of editing this one.'
            USING DETAIL = 'error 51009';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_PaymentDetail_Immutable" ON "${flyway:defaultSchema}"."PaymentDetail";
CREATE TRIGGER "trg_PaymentDetail_Immutable"
    AFTER UPDATE ON "${flyway:defaultSchema}"."PaymentDetail"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_PaymentDetail_Immutable"();


-- -----------------------------------------------------------------------------
-- trg_OrderHeaderPaymentSchedule_Immutable (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderHeaderPaymentSchedule_Immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- DELETE: only a Scheduled row may go.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM deleted WHERE "Status" <> 'Scheduled') THEN
            RAISE EXCEPTION 'An instalment cannot be deleted once it is Invoiced (the customer holds its number). Cancel or write it off instead.'
                USING DETAIL = 'error 51020';
        END IF;
        RETURN NULL;
    END IF;

    -- UPDATE past Scheduled: the commitment and its identity are frozen, and it never returns.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" <> 'Scheduled'
          AND (
            i."OrderHeaderID"     <> d."OrderHeaderID"     OR
            i."CompanyID"         <> d."CompanyID"         OR
            i."InstallmentNumber" <> d."InstallmentNumber" OR
            i."DueDate"           <> d."DueDate"           OR
            i."Amount"            <> d."Amount"            OR
            COALESCE(i."DocumentNumber", '') <> COALESCE(d."DocumentNumber", '') OR
            COALESCE(i."InvoicedAt", '1900-01-01') <> COALESCE(d."InvoicedAt", '1900-01-01') OR
            COALESCE(i."InvoicedByUserID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."InvoicedByUserID", '00000000-0000-0000-0000-000000000000') OR
            i."Status" = 'Scheduled'
          )
    ) THEN
        RAISE EXCEPTION 'An Invoiced instalment is frozen: its amount, due date, number and identity cannot change, and it cannot return to Scheduled. Corrections go through a credit memo.'
            USING DETAIL = 'error 51021';
    END IF;

    -- Identity is set once, never cleared or replaced — at any status.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE (d."DocumentNumber" IS NOT NULL AND (i."DocumentNumber" IS NULL OR i."DocumentNumber" <> d."DocumentNumber"))
           OR (d."JournalEntryID" IS NOT NULL AND (i."JournalEntryID" IS NULL OR i."JournalEntryID" <> d."JournalEntryID"))
    ) THEN
        RAISE EXCEPTION 'OrderHeaderPaymentSchedule.DocumentNumber and JournalEntryID cannot be cleared or replaced once set.'
            USING DETAIL = 'error 51022';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderHeaderPaymentSchedule_Immutable" ON "${flyway:defaultSchema}"."OrderHeaderPaymentSchedule";
CREATE TRIGGER "trg_OrderHeaderPaymentSchedule_Immutable"
    AFTER UPDATE ON "${flyway:defaultSchema}"."OrderHeaderPaymentSchedule"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderHeaderPaymentSchedule_Immutable"();

DROP TRIGGER IF EXISTS "trg_OrderHeaderPaymentSchedule_Immutable_Delete" ON "${flyway:defaultSchema}"."OrderHeaderPaymentSchedule";
CREATE TRIGGER "trg_OrderHeaderPaymentSchedule_Immutable_Delete"
    AFTER DELETE ON "${flyway:defaultSchema}"."OrderHeaderPaymentSchedule"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderHeaderPaymentSchedule_Immutable"();


-- -----------------------------------------------------------------------------
-- trg_OrderLineProgressMeasurement_Immutable (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderLineProgressMeasurement_Immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- BACKWARD: a row that was already Posted cannot be changed or deleted.
    IF EXISTS (SELECT 1 FROM deleted WHERE "Status" = 'Posted') THEN
        RAISE EXCEPTION 'A posted progress observation is immutable: it cannot be changed or deleted. Record a new observation for the current period instead — the catch-up absorbs the correction.'
            USING DETAIL = 'error 51030';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN NULL;
    END IF;

    -- FORWARD: nothing may promote a Draft observation to Posted. The operation
    -- writes its row Posted from the outset, in the same transaction as the
    -- journal entry, so a Draft row becoming Posted means a recognition amount
    -- and a journal entry id were asserted by something that posted neither.
    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN deleted d ON d."ID" = i."ID"
         WHERE d."Status" = 'Draft' AND i."Status" = 'Posted'
    ) THEN
        RAISE EXCEPTION 'A progress observation cannot be promoted from Draft to Posted. Posting is what Orders.RecordProgress does, in the same transaction as the journal entry it writes — a row flipped by hand would claim revenue the ledger never saw.'
            USING DETAIL = 'error 51031';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_OrderLineProgressMeasurement_Immutable" ON "${flyway:defaultSchema}"."OrderLineProgressMeasurement";
CREATE TRIGGER "trg_OrderLineProgressMeasurement_Immutable"
    AFTER UPDATE ON "${flyway:defaultSchema}"."OrderLineProgressMeasurement"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderLineProgressMeasurement_Immutable"();

DROP TRIGGER IF EXISTS "trg_OrderLineProgressMeasurement_Immutable_Delete" ON "${flyway:defaultSchema}"."OrderLineProgressMeasurement";
CREATE TRIGGER "trg_OrderLineProgressMeasurement_Immutable_Delete"
    AFTER DELETE ON "${flyway:defaultSchema}"."OrderLineProgressMeasurement"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_OrderLineProgressMeasurement_Immutable"();


-- -----------------------------------------------------------------------------
-- trg_EntitlementAccessOverride_Record (AFTER UPDATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_EntitlementAccessOverride_Record"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i."ID" = d."ID"
        WHERE i."OrderHeaderID" <> d."OrderHeaderID"
           OR i."OverrideType" <> d."OverrideType"
           OR i."Reason" <> d."Reason"
           OR i."EffectiveThrough" <> d."EffectiveThrough"
           OR i."RequestedByUserID" <> d."RequestedByUserID"
           OR ABS(EXTRACT(EPOCH FROM (i."RequestedAt" - d."RequestedAt")) * 1000000) >= 1000
    ) THEN
        RAISE EXCEPTION 'An access override''s request (order, type, reason, EffectiveThrough, requester) cannot be changed. Request a new override instead.'
            USING DETAIL = 'error 51023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i."ID" = d."ID"
        WHERE i."Status" <> d."Status"
          AND NOT (d."Status" = 'Requested' AND i."Status" IN ('Approved','Rejected','Withdrawn'))
          AND NOT (d."Status" = 'Approved' AND i."Status" = 'Expired')
    ) THEN
        RAISE EXCEPTION 'An access override''s status moves only from Requested to Approved, Rejected or Withdrawn, and from Approved to Expired.'
            USING DETAIL = 'error 51024';
    END IF;

    IF EXISTS (
        SELECT 1 FROM deleted d JOIN inserted i ON i."ID" = d."ID"
        WHERE (d."ApprovalTaskID" IS NOT NULL AND (i."ApprovalTaskID" IS NULL OR i."ApprovalTaskID" <> d."ApprovalTaskID"))
           OR (d."DecidedAt" IS NOT NULL AND (i."DecidedAt" IS NULL OR ABS(EXTRACT(EPOCH FROM (i."DecidedAt" - d."DecidedAt")) * 1000000) >= 1000))
           OR (d."DecidedByUserID" IS NOT NULL AND (i."DecidedByUserID" IS NULL OR i."DecidedByUserID" <> d."DecidedByUserID"))
    ) THEN
        RAISE EXCEPTION 'An access override''s approval task and decision cannot be rewritten once recorded.'
            USING DETAIL = 'error 51025';
    END IF;

    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_EntitlementAccessOverride_Record" ON "${flyway:defaultSchema}"."EntitlementAccessOverride";
CREATE TRIGGER "trg_EntitlementAccessOverride_Record"
    AFTER UPDATE ON "${flyway:defaultSchema}"."EntitlementAccessOverride"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_EntitlementAccessOverride_Record"();

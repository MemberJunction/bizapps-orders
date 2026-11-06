-- =============================================================================================
-- PostgreSQL counterpart of V202611052330__v5.42.x__Payment_Received_Date.sql
-- =============================================================================================
-- Written by hand in PL/pgSQL from the T-SQL (the converter passes T-SQL triggers through
-- untranslated). The column is added as the T-SQL adds it; the trigger function is replaced whole
-- from V202610091200 with PaymentDate taken out of 51005 and the new check 51033, and the triggers
-- already bound to it (update and delete) pick it up unchanged. See the T-SQL file for why
-- (bc-aidp-next-golive#448). LinkedRecordID is compared in lower case, the form a uuid takes as text.
-- CodeGen output is not generated yet; it follows the T-SQL file's.
-- =============================================================================================

ALTER TABLE __mj_BizAppsOrders."OrderHeader"
    ADD COLUMN "InitialPaymentReceivedDate" DATE NULL;

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."InitialPaymentReceivedDate" IS
    'The day the initial payment''s money arrived, when it differs from the order''s date (for example a wire received before the order was entered). The payment created at confirm is dated from this day, and from OrderDate when it is NULL. Read only at confirm; changing it afterwards does not move the payment, whose date finance corrects on the payment itself.';

CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fn_trg_PaymentHeader_ImmutableAfterCapture"()
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
    -- PaymentDate is checked separately below (51033).
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
            i."ReceivingCompanyID"   <> d."ReceivingCompanyID"   OR
            COALESCE(i."BillToOrganizationID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."BillToOrganizationID", '00000000-0000-0000-0000-000000000000')
         OR COALESCE(i."BillToPersonID", '00000000-0000-0000-0000-000000000000') <> COALESCE(d."BillToPersonID", '00000000-0000-0000-0000-000000000000')
          )
    ) THEN
        RAISE EXCEPTION 'Payment financial fields (Amount/Fees/PaymentType/ReceivingCompanyID/Customer) are frozen once Captured. Use a reversal payment.'
            USING DETAIL = 'error 51005';
    END IF;

    -- PaymentDate: a captured payment's date moves only while every journal entry
    -- booked from it or its allocations is still Pending and in no batch.
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i."ID" = d."ID"
        WHERE d."Status" IN ('Captured','Refunded','Disputed')
          AND i."PaymentDate" <> d."PaymentDate"
          AND EXISTS (
              SELECT 1
              FROM __mj_BizAppsAccounting."JournalEntry" je
              WHERE (je."Status" <> 'Pending' OR je."JournalEntryBatchID" IS NOT NULL)
                AND (lower(je."LinkedRecordID") = d."ID"::text
                     OR lower(je."LinkedRecordID") IN (
                         SELECT pl."ID"::text
                         FROM __mj_BizAppsOrders."PaymentLine" pl
                         WHERE pl."PaymentHeaderID" = d."ID"))
          )
    ) THEN
        RAISE EXCEPTION 'Payment.PaymentDate cannot change once any of the payment''s journal entries is batched or posted. Cancel the batch first, or use a reversal payment.'
            USING DETAIL = 'error 51033';
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

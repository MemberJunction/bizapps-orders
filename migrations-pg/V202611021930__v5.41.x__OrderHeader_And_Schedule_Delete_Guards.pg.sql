-- =============================================================================
-- V202611021930 — OrderHeader and OrderHeaderPaymentSchedule delete guards
--                 (PostgreSQL)
-- =============================================================================
-- 1. trg_OrderHeader_ImmutableAfterConfirm gains an AFTER DELETE trigger and
--    51019: a Confirmed order header cannot be deleted.
-- 2. trg_OrderHeaderPaymentSchedule_Immutable (51020) also refuses deleting a
--    company's last non-Canceled payment schedule row once its order is
--    Confirmed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- trg_OrderHeader_ImmutableAfterConfirm (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."fn_trg_OrderHeader_ImmutableAfterConfirm"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- 51019: DELETE. Block if any deleted header is Confirmed.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM deleted WHERE "Status" = 'Confirmed') THEN
            RAISE EXCEPTION 'OrderHeader cannot be deleted once it is Confirmed (the order is booked under journal entries). Use a reversal order.'
                USING DETAIL = 'error 51019';
        END IF;
        RETURN NULL;
    END IF;

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
                  FROM ${flyway:defaultSchema}."OrderConcession" c
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

CREATE TRIGGER "trg_OrderHeader_ImmutableAfterConfirm_Delete"
    AFTER DELETE ON ${flyway:defaultSchema}."OrderHeader"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION ${flyway:defaultSchema}."fn_trg_OrderHeader_ImmutableAfterConfirm"();


-- -----------------------------------------------------------------------------
-- trg_OrderHeaderPaymentSchedule_Immutable (AFTER UPDATE, DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."fn_trg_OrderHeaderPaymentSchedule_Immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- DELETE: only a Scheduled row may go, and never the last non-Canceled row
    -- for its company on a Confirmed order.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM deleted WHERE "Status" <> 'Scheduled') THEN
            RAISE EXCEPTION 'An instalment cannot be deleted once it is Invoiced (the customer holds its number). Cancel or write it off instead.'
                USING DETAIL = 'error 51020';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN ${flyway:defaultSchema}."OrderHeader" o ON o."ID" = d."OrderHeaderID"
            WHERE o."Status" = 'Confirmed'
              AND NOT EXISTS (
                  SELECT 1
                  FROM ${flyway:defaultSchema}."OrderHeaderPaymentSchedule" s
                  WHERE s."OrderHeaderID" = d."OrderHeaderID"
                    AND s."CompanyID" = d."CompanyID"
                    AND s."Status" <> 'Canceled'
              )
        ) THEN
            RAISE EXCEPTION 'A company''s last payment schedule row cannot be deleted once the order is Confirmed (doing so would leave that company unbilled). Re-shape the schedule on a surviving row instead.'
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

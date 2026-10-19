-- =============================================================================================
-- PostgreSQL counterpart of V202610182300__v5.35.x__OrderLine_Freeze_Discount_And_Charge.sql
-- =============================================================================================
-- Written by hand in PL/pgSQL from the T-SQL (the converter passes T-SQL triggers through
-- untranslated). The trigger function is replaced whole from V202610131504 with two added
-- comparisons; the triggers already bound to it (update and delete) pick it up unchanged.
-- See the T-SQL file for why (#827).
-- =============================================================================================

CREATE OR REPLACE FUNCTION __mj_BizAppsOrders."fn_trg_OrderLine_ImmutableAfterConfirm"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- 51002: DELETE. Block if any deleted line belongs to a Confirmed order.
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
            FROM deleted d
            JOIN __mj_BizAppsOrders."OrderHeader" o ON o."ID" = d."OrderHeaderID"
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
        JOIN __mj_BizAppsOrders."OrderHeader" o ON o."ID" = d."OrderHeaderID"
        WHERE o."Status" = 'Confirmed'
          AND (
            i."ProductID"      <> d."ProductID"      OR
            i."CompanyID"      <> d."CompanyID"      OR
            i."Quantity"       <> d."Quantity"       OR
            i."UnitPrice"      <> d."UnitPrice"      OR
            i."DiscountPct"    <> d."DiscountPct"    OR
            i."LineTax"        <> d."LineTax"        OR
            COALESCE(i."LineTotalNet",   0) <> COALESCE(d."LineTotalNet",   0) OR
            COALESCE(i."LineTotalGross", 0) <> COALESCE(d."LineTotalGross", 0) OR
            i."ExtendedAmount" IS DISTINCT FROM d."ExtendedAmount" OR
            COALESCE(i."DiscountAmount", 0) <> COALESCE(d."DiscountAmount", 0) OR
            COALESCE(i."ChargeAmount",   0) <> COALESCE(d."ChargeAmount",   0)
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
        JOIN __mj_BizAppsOrders."OrderHeader" o ON o."ID" = d."OrderHeaderID"
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

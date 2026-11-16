-- =============================================================================================
-- PostgreSQL counterpart of V202611161530__v5.51.x__OrderLine_Freeze_Service_Period.sql
-- =============================================================================================
-- Written by hand in PL/pgSQL from the T-SQL (the converter passes T-SQL triggers through
-- untranslated). The trigger function is replaced whole from V202611031730 with the added
-- service-period comparison; the triggers already bound to it (update and delete) pick it up
-- unchanged. See the T-SQL file for why, and for the subscription-term exemption (golive #391).
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
            COALESCE(i."ChargeAmount",   0) <> COALESCE(d."ChargeAmount",   0) OR
            (
                -- The service period: recognition was scheduled over it at confirm (golive #391).
                (i."ServicePeriodStart" IS DISTINCT FROM d."ServicePeriodStart" OR
                 i."ServicePeriodEnd"   IS DISTINCT FROM d."ServicePeriodEnd")
                -- ...unless the new period is one of the line's own subscription terms...
                AND NOT EXISTS (
                    SELECT 1
                    FROM __mj_BizAppsOrders."SubscriptionTerm" t
                    WHERE t."OrderLineID" = i."ID"
                      AND t."StartDate" = i."ServicePeriodStart"
                      AND t."EndDate"   = i."ServicePeriodEnd"
                )
                -- ...or the span of all of them.
                AND NOT EXISTS (
                    SELECT 1
                    FROM __mj_BizAppsOrders."SubscriptionTerm" t
                    WHERE t."OrderLineID" = i."ID"
                    HAVING MIN(t."StartDate") = i."ServicePeriodStart"
                       AND MAX(t."EndDate")   = i."ServicePeriodEnd"
                )
            )
          )
    ) THEN
        RAISE EXCEPTION 'OrderLine financial columns, service period and selling company cannot be changed once its order is Confirmed (the line is booked under a journal entry). Use a reversal order; a subscription line''s service period moves only with its subscription term.'
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

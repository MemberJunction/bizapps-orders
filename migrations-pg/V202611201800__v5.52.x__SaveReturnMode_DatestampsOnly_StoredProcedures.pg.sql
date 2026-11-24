-- =============================================================================
-- PostgreSQL counterpart of V202611201800__v5.52.x__SaveReturnMode_DatestampsOnly_StoredProcedures.sql
-- =============================================================================
-- Atomically enables SaveReturnMode = 'datestamps_only' and TrackRecordChanges = FALSE
-- on MJ_BizApps_Orders: Outbound Deliveries, Outbound Events, Payment Webhook Deliveries,
-- and Subscription Events, and installs the native MJ 6.2.1 CodeGen PL/pgSQL
-- spCreate*/spUpdate* functions returning
-- TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ)
-- whenever those base tables exist in the PostgreSQL schema.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS __mj_bizappsorders;
SET search_path TO __mj_bizappsorders, public;
SET standard_conforming_strings = on;

-- Atomically enable SaveReturnMode = datestamps_only and TrackRecordChanges = FALSE
-- to match metadata/entities/.save-return-datestamps-only.json.
UPDATE ${mjSchema}."Entity"
SET
    "TrackRecordChanges" = FALSE,
    "Configuration" = CASE
        WHEN NULLIF(BTRIM(COALESCE("Configuration", '')), '') IS NULL
            THEN '{
  "SaveReturnMode": "datestamps_only"
}'
        ELSE jsonb_pretty(jsonb_set("Configuration"::jsonb, '{SaveReturnMode}', '"datestamps_only"'::jsonb, TRUE))
    END
WHERE LOWER("SchemaName") = '__mj_bizappsorders'
  AND "BaseTable" IN ('OutboundDelivery', 'OutboundEvent', 'PaymentWebhookDelivery', 'SubscriptionEvent');

-- =============================================================================
-- Native PostgreSQL CodeGen CRUD functions (SaveReturnMode = datestamps_only)
-- Guarded on base table existence because these 4 tables predate the
-- repository's migrations-pg parity chain.
-- =============================================================================

------------------------------------------------------------
----- OutboundDelivery
------------------------------------------------------------
DO $install_outbound_delivery$
DECLARE
    r RECORD;
BEGIN
    IF to_regclass('__mj_bizappsorders."OutboundDelivery"') IS NOT NULL THEN
        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spCreateOutboundDelivery'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spCreateOutboundDelivery"(
    p_id UUID DEFAULT NULL,
    p_outboundeventid UUID DEFAULT NULL,
    p_consumerkey VARCHAR(100) DEFAULT NULL,
    p_gatesaccess BOOLEAN DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_attempts INTEGER DEFAULT NULL,
    p_nextattemptat TIMESTAMPTZ DEFAULT NULL,
    p_deadlineat TIMESTAMPTZ DEFAULT NULL,
    p_leaseuntil_clear BOOLEAN DEFAULT FALSE,
    p_leaseuntil TIMESTAMPTZ DEFAULT NULL,
    p_lastattemptat_clear BOOLEAN DEFAULT FALSE,
    p_lastattemptat TIMESTAMPTZ DEFAULT NULL,
    p_lasterror_clear BOOLEAN DEFAULT FALSE,
    p_lasterror VARCHAR(2000) DEFAULT NULL,
    p_deliveredat_clear BOOLEAN DEFAULT FALSE,
    p_deliveredat TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappsorders."OutboundDelivery"
        (
            "ID",
            "OutboundEventID",
            "ConsumerKey",
            "GatesAccess",
            "Status",
            "Attempts",
            "NextAttemptAt",
            "DeadlineAt",
            "LeaseUntil",
            "LastAttemptAt",
            "LastError",
            "DeliveredAt"
        )
    VALUES
        (
            v_new_id,
            p_outboundeventid,
            p_consumerkey,
            COALESCE(p_gatesaccess, FALSE),
            COALESCE(p_status, 'Pending'),
            COALESCE(p_attempts, 0),
            COALESCE(p_nextattemptat, NOW()),
            p_deadlineat,
            CASE WHEN p_leaseuntil_clear = TRUE THEN NULL ELSE COALESCE(p_leaseuntil, NULL) END,
            CASE WHEN p_lastattemptat_clear = TRUE THEN NULL ELSE COALESCE(p_lastattemptat, NULL) END,
            CASE WHEN p_lasterror_clear = TRUE THEN NULL ELSE COALESCE(p_lasterror, NULL) END,
            CASE WHEN p_deliveredat_clear = TRUE THEN NULL ELSE COALESCE(p_deliveredat, NULL) END
        );

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."OutboundDelivery"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spCreateOutboundDelivery" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;

        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spUpdateOutboundDelivery'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spUpdateOutboundDelivery"(
    p_id UUID,
    p_outboundeventid UUID DEFAULT NULL,
    p_consumerkey VARCHAR(100) DEFAULT NULL,
    p_gatesaccess BOOLEAN DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_attempts INTEGER DEFAULT NULL,
    p_nextattemptat TIMESTAMPTZ DEFAULT NULL,
    p_deadlineat TIMESTAMPTZ DEFAULT NULL,
    p_leaseuntil_clear BOOLEAN DEFAULT FALSE,
    p_leaseuntil TIMESTAMPTZ DEFAULT NULL,
    p_lastattemptat_clear BOOLEAN DEFAULT FALSE,
    p_lastattemptat TIMESTAMPTZ DEFAULT NULL,
    p_lasterror_clear BOOLEAN DEFAULT FALSE,
    p_lasterror VARCHAR(2000) DEFAULT NULL,
    p_deliveredat_clear BOOLEAN DEFAULT FALSE,
    p_deliveredat TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappsorders."OutboundDelivery"
    SET
        "OutboundEventID" = COALESCE(p_outboundeventid, "OutboundEventID"),
        "ConsumerKey" = COALESCE(p_consumerkey, "ConsumerKey"),
        "GatesAccess" = COALESCE(p_gatesaccess, "GatesAccess"),
        "Status" = COALESCE(p_status, "Status"),
        "Attempts" = COALESCE(p_attempts, "Attempts"),
        "NextAttemptAt" = COALESCE(p_nextattemptat, "NextAttemptAt"),
        "DeadlineAt" = COALESCE(p_deadlineat, "DeadlineAt"),
        "LeaseUntil" = CASE WHEN p_leaseuntil_clear = TRUE THEN NULL ELSE COALESCE(p_leaseuntil, "LeaseUntil") END,
        "LastAttemptAt" = CASE WHEN p_lastattemptat_clear = TRUE THEN NULL ELSE COALESCE(p_lastattemptat, "LastAttemptAt") END,
        "LastError" = CASE WHEN p_lasterror_clear = TRUE THEN NULL ELSE COALESCE(p_lasterror, "LastError") END,
        "DeliveredAt" = CASE WHEN p_deliveredat_clear = TRUE THEN NULL ELSE COALESCE(p_deliveredat, "DeliveredAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."OutboundDelivery"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spUpdateOutboundDelivery" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;
    END IF;
END
$install_outbound_delivery$;

------------------------------------------------------------
----- OutboundEvent
------------------------------------------------------------
DO $install_outbound_event$
DECLARE
    r RECORD;
BEGIN
    IF to_regclass('__mj_bizappsorders."OutboundEvent"') IS NOT NULL THEN
        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spCreateOutboundEvent'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spCreateOutboundEvent"(
    p_id UUID DEFAULT NULL,
    p_eventtype VARCHAR(40) DEFAULT NULL,
    p_orderheaderid_clear BOOLEAN DEFAULT FALSE,
    p_orderheaderid UUID DEFAULT NULL,
    p_entitlementgrantid_clear BOOLEAN DEFAULT FALSE,
    p_entitlementgrantid UUID DEFAULT NULL,
    p_payloadjson TEXT DEFAULT NULL,
    p_occurredat TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappsorders."OutboundEvent"
        (
            "ID",
            "EventType",
            "OrderHeaderID",
            "EntitlementGrantID",
            "PayloadJSON",
            "OccurredAt"
        )
    VALUES
        (
            v_new_id,
            p_eventtype,
            CASE WHEN p_orderheaderid_clear = TRUE THEN NULL ELSE COALESCE(p_orderheaderid, NULL) END,
            CASE WHEN p_entitlementgrantid_clear = TRUE THEN NULL ELSE COALESCE(p_entitlementgrantid, NULL) END,
            p_payloadjson,
            COALESCE(p_occurredat, NOW())
        );

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."OutboundEvent"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spCreateOutboundEvent" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;

        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spUpdateOutboundEvent'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spUpdateOutboundEvent"(
    p_id UUID,
    p_eventtype VARCHAR(40) DEFAULT NULL,
    p_orderheaderid_clear BOOLEAN DEFAULT FALSE,
    p_orderheaderid UUID DEFAULT NULL,
    p_entitlementgrantid_clear BOOLEAN DEFAULT FALSE,
    p_entitlementgrantid UUID DEFAULT NULL,
    p_payloadjson TEXT DEFAULT NULL,
    p_occurredat TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappsorders."OutboundEvent"
    SET
        "EventType" = COALESCE(p_eventtype, "EventType"),
        "OrderHeaderID" = CASE WHEN p_orderheaderid_clear = TRUE THEN NULL ELSE COALESCE(p_orderheaderid, "OrderHeaderID") END,
        "EntitlementGrantID" = CASE WHEN p_entitlementgrantid_clear = TRUE THEN NULL ELSE COALESCE(p_entitlementgrantid, "EntitlementGrantID") END,
        "PayloadJSON" = COALESCE(p_payloadjson, "PayloadJSON"),
        "OccurredAt" = COALESCE(p_occurredat, "OccurredAt")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."OutboundEvent"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spUpdateOutboundEvent" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;
    END IF;
END
$install_outbound_event$;

------------------------------------------------------------
----- PaymentWebhookDelivery
------------------------------------------------------------
DO $install_payment_webhook_delivery$
DECLARE
    r RECORD;
BEGIN
    IF to_regclass('__mj_bizappsorders."PaymentWebhookDelivery"') IS NOT NULL THEN
        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spCreatePaymentWebhookDelivery'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spCreatePaymentWebhookDelivery"(
    p_id UUID DEFAULT NULL,
    p_paymentproviderid UUID DEFAULT NULL,
    p_providereventid_clear BOOLEAN DEFAULT FALSE,
    p_providereventid VARCHAR(100) DEFAULT NULL,
    p_eventkind_clear BOOLEAN DEFAULT FALSE,
    p_eventkind VARCHAR(100) DEFAULT NULL,
    p_paymentintentid_clear BOOLEAN DEFAULT FALSE,
    p_paymentintentid UUID DEFAULT NULL,
    p_providerintentid_clear BOOLEAN DEFAULT FALSE,
    p_providerintentid VARCHAR(100) DEFAULT NULL,
    p_providerchargeid_clear BOOLEAN DEFAULT FALSE,
    p_providerchargeid VARCHAR(100) DEFAULT NULL,
    p_outcome VARCHAR(20) DEFAULT NULL,
    p_reasoncode_clear BOOLEAN DEFAULT FALSE,
    p_reasoncode VARCHAR(40) DEFAULT NULL,
    p_reason_clear BOOLEAN DEFAULT FALSE,
    p_reason VARCHAR(1000) DEFAULT NULL,
    p_occurredat_clear BOOLEAN DEFAULT FALSE,
    p_occurredat TIMESTAMPTZ DEFAULT NULL,
    p_firstreceivedat TIMESTAMPTZ DEFAULT NULL,
    p_lastreceivedat TIMESTAMPTZ DEFAULT NULL,
    p_deliverycount INTEGER DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappsorders."PaymentWebhookDelivery"
        (
            "ID",
            "PaymentProviderID",
            "ProviderEventID",
            "EventKind",
            "PaymentIntentID",
            "ProviderIntentID",
            "ProviderChargeID",
            "Outcome",
            "ReasonCode",
            "Reason",
            "OccurredAt",
            "FirstReceivedAt",
            "LastReceivedAt",
            "DeliveryCount"
        )
    VALUES
        (
            v_new_id,
            p_paymentproviderid,
            CASE WHEN p_providereventid_clear = TRUE THEN NULL ELSE COALESCE(p_providereventid, NULL) END,
            CASE WHEN p_eventkind_clear = TRUE THEN NULL ELSE COALESCE(p_eventkind, NULL) END,
            CASE WHEN p_paymentintentid_clear = TRUE THEN NULL ELSE COALESCE(p_paymentintentid, NULL) END,
            CASE WHEN p_providerintentid_clear = TRUE THEN NULL ELSE COALESCE(p_providerintentid, NULL) END,
            CASE WHEN p_providerchargeid_clear = TRUE THEN NULL ELSE COALESCE(p_providerchargeid, NULL) END,
            p_outcome,
            CASE WHEN p_reasoncode_clear = TRUE THEN NULL ELSE COALESCE(p_reasoncode, NULL) END,
            CASE WHEN p_reason_clear = TRUE THEN NULL ELSE COALESCE(p_reason, NULL) END,
            CASE WHEN p_occurredat_clear = TRUE THEN NULL ELSE COALESCE(p_occurredat, NULL) END,
            COALESCE(p_firstreceivedat, NOW()),
            COALESCE(p_lastreceivedat, NOW()),
            COALESCE(p_deliverycount, 1)
        );

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."PaymentWebhookDelivery"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spCreatePaymentWebhookDelivery" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;

        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spUpdatePaymentWebhookDelivery'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spUpdatePaymentWebhookDelivery"(
    p_id UUID,
    p_paymentproviderid UUID DEFAULT NULL,
    p_providereventid_clear BOOLEAN DEFAULT FALSE,
    p_providereventid VARCHAR(100) DEFAULT NULL,
    p_eventkind_clear BOOLEAN DEFAULT FALSE,
    p_eventkind VARCHAR(100) DEFAULT NULL,
    p_paymentintentid_clear BOOLEAN DEFAULT FALSE,
    p_paymentintentid UUID DEFAULT NULL,
    p_providerintentid_clear BOOLEAN DEFAULT FALSE,
    p_providerintentid VARCHAR(100) DEFAULT NULL,
    p_providerchargeid_clear BOOLEAN DEFAULT FALSE,
    p_providerchargeid VARCHAR(100) DEFAULT NULL,
    p_outcome VARCHAR(20) DEFAULT NULL,
    p_reasoncode_clear BOOLEAN DEFAULT FALSE,
    p_reasoncode VARCHAR(40) DEFAULT NULL,
    p_reason_clear BOOLEAN DEFAULT FALSE,
    p_reason VARCHAR(1000) DEFAULT NULL,
    p_occurredat_clear BOOLEAN DEFAULT FALSE,
    p_occurredat TIMESTAMPTZ DEFAULT NULL,
    p_firstreceivedat TIMESTAMPTZ DEFAULT NULL,
    p_lastreceivedat TIMESTAMPTZ DEFAULT NULL,
    p_deliverycount INTEGER DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappsorders."PaymentWebhookDelivery"
    SET
        "PaymentProviderID" = COALESCE(p_paymentproviderid, "PaymentProviderID"),
        "ProviderEventID" = CASE WHEN p_providereventid_clear = TRUE THEN NULL ELSE COALESCE(p_providereventid, "ProviderEventID") END,
        "EventKind" = CASE WHEN p_eventkind_clear = TRUE THEN NULL ELSE COALESCE(p_eventkind, "EventKind") END,
        "PaymentIntentID" = CASE WHEN p_paymentintentid_clear = TRUE THEN NULL ELSE COALESCE(p_paymentintentid, "PaymentIntentID") END,
        "ProviderIntentID" = CASE WHEN p_providerintentid_clear = TRUE THEN NULL ELSE COALESCE(p_providerintentid, "ProviderIntentID") END,
        "ProviderChargeID" = CASE WHEN p_providerchargeid_clear = TRUE THEN NULL ELSE COALESCE(p_providerchargeid, "ProviderChargeID") END,
        "Outcome" = COALESCE(p_outcome, "Outcome"),
        "ReasonCode" = CASE WHEN p_reasoncode_clear = TRUE THEN NULL ELSE COALESCE(p_reasoncode, "ReasonCode") END,
        "Reason" = CASE WHEN p_reason_clear = TRUE THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "OccurredAt" = CASE WHEN p_occurredat_clear = TRUE THEN NULL ELSE COALESCE(p_occurredat, "OccurredAt") END,
        "FirstReceivedAt" = COALESCE(p_firstreceivedat, "FirstReceivedAt"),
        "LastReceivedAt" = COALESCE(p_lastreceivedat, "LastReceivedAt"),
        "DeliveryCount" = COALESCE(p_deliverycount, "DeliveryCount")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."PaymentWebhookDelivery"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spUpdatePaymentWebhookDelivery" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;
    END IF;
END
$install_payment_webhook_delivery$;

------------------------------------------------------------
----- SubscriptionEvent
------------------------------------------------------------
DO $install_subscription_event$
DECLARE
    r RECORD;
BEGIN
    IF to_regclass('__mj_bizappsorders."SubscriptionEvent"') IS NOT NULL THEN
        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spCreateSubscriptionEvent'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spCreateSubscriptionEvent"(
    p_id UUID DEFAULT NULL,
    p_subscriptionid UUID DEFAULT NULL,
    p_eventtype VARCHAR(40) DEFAULT NULL,
    p_occurredat TIMESTAMPTZ DEFAULT NULL,
    p_eventdata_clear BOOLEAN DEFAULT FALSE,
    p_eventdata TEXT DEFAULT NULL,
    p_providereventid_clear BOOLEAN DEFAULT FALSE,
    p_providereventid VARCHAR(100) DEFAULT NULL,
    p_relatedpaymentid_clear BOOLEAN DEFAULT FALSE,
    p_relatedpaymentid UUID DEFAULT NULL,
    p_relatedorderheaderid_clear BOOLEAN DEFAULT FALSE,
    p_relatedorderheaderid UUID DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappsorders."SubscriptionEvent"
        (
            "ID",
            "SubscriptionID",
            "EventType",
            "OccurredAt",
            "EventData",
            "ProviderEventID",
            "RelatedPaymentID",
            "RelatedOrderHeaderID"
        )
    VALUES
        (
            v_new_id,
            p_subscriptionid,
            p_eventtype,
            p_occurredat,
            CASE WHEN p_eventdata_clear = TRUE THEN NULL ELSE COALESCE(p_eventdata, NULL) END,
            CASE WHEN p_providereventid_clear = TRUE THEN NULL ELSE COALESCE(p_providereventid, NULL) END,
            CASE WHEN p_relatedpaymentid_clear = TRUE THEN NULL ELSE COALESCE(p_relatedpaymentid, NULL) END,
            CASE WHEN p_relatedorderheaderid_clear = TRUE THEN NULL ELSE COALESCE(p_relatedorderheaderid, NULL) END
        );

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."SubscriptionEvent"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spCreateSubscriptionEvent" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;

        FOR r IN SELECT oid::regprocedure AS sig
                 FROM pg_proc
                 WHERE proname = 'spUpdateSubscriptionEvent'
                   AND pronamespace = '__mj_bizappsorders'::regnamespace
        LOOP
            EXECUTE 'DROP FUNCTION ' || r.sig::text;
        END LOOP;

        EXECUTE $fn$
CREATE OR REPLACE FUNCTION __mj_bizappsorders."spUpdateSubscriptionEvent"(
    p_id UUID,
    p_subscriptionid UUID DEFAULT NULL,
    p_eventtype VARCHAR(40) DEFAULT NULL,
    p_occurredat TIMESTAMPTZ DEFAULT NULL,
    p_eventdata_clear BOOLEAN DEFAULT FALSE,
    p_eventdata TEXT DEFAULT NULL,
    p_providereventid_clear BOOLEAN DEFAULT FALSE,
    p_providereventid VARCHAR(100) DEFAULT NULL,
    p_relatedpaymentid_clear BOOLEAN DEFAULT FALSE,
    p_relatedpaymentid UUID DEFAULT NULL,
    p_relatedorderheaderid_clear BOOLEAN DEFAULT FALSE,
    p_relatedorderheaderid UUID DEFAULT NULL
) RETURNS TABLE("ID" UUID, "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ) AS $$
#variable_conflict use_column
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappsorders."SubscriptionEvent"
    SET
        "SubscriptionID" = COALESCE(p_subscriptionid, "SubscriptionID"),
        "EventType" = COALESCE(p_eventtype, "EventType"),
        "OccurredAt" = COALESCE(p_occurredat, "OccurredAt"),
        "EventData" = CASE WHEN p_eventdata_clear = TRUE THEN NULL ELSE COALESCE(p_eventdata, "EventData") END,
        "ProviderEventID" = CASE WHEN p_providereventid_clear = TRUE THEN NULL ELSE COALESCE(p_providereventid, "ProviderEventID") END,
        "RelatedPaymentID" = CASE WHEN p_relatedpaymentid_clear = TRUE THEN NULL ELSE COALESCE(p_relatedpaymentid, "RelatedPaymentID") END,
        "RelatedOrderHeaderID" = CASE WHEN p_relatedorderheaderid_clear = TRUE THEN NULL ELSE COALESCE(p_relatedorderheaderid, "RelatedOrderHeaderID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT "ID", "__mj_CreatedAt", "__mj_UpdatedAt" FROM __mj_bizappsorders."SubscriptionEvent"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
$fn$;

        BEGIN
            GRANT EXECUTE ON FUNCTION __mj_bizappsorders."spUpdateSubscriptionEvent" TO "cdp_Developer", "cdp_Integration";
        EXCEPTION WHEN others THEN NULL;
        END;
    END IF;
END
$install_subscription_event$;

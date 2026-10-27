-- =============================================================================
-- PostgreSQL counterpart of V202610271210__v5.39.x__InstalmentLineBilling_Immutable.sql
-- =============================================================================
-- Refuses any UPDATE or DELETE of an InstalmentLineBilling row (#713). Written
-- by hand in the style of V202610091200's Postgres guards: `mj sql-convert`
-- does not translate T-SQL triggers.
--
--   * A statement-level AFTER trigger per event (Postgres does not allow
--     transition tables on a trigger with more than one event), sharing one
--     function.
--   * THROW 51032 becomes RAISE EXCEPTION with the same message and the T-SQL
--     error number in DETAIL.
--   * The T-SQL guard skips the nested UPDATE of MJ's __mj_UpdatedAt trigger.
--     On Postgres MJ stamps __mj_UpdatedAt in a BEFORE trigger with no second
--     UPDATE, so there is nothing to skip.
-- =============================================================================

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."fn_trg_InstalmentLineBilling_Immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- Zero-row statements must not touch anything.
    IF NOT EXISTS (SELECT 1 FROM deleted) THEN
        RETURN NULL;
    END IF;

    RAISE EXCEPTION 'InstalmentLineBilling rows record what an issued instalment invoice billed each line and cannot be changed or deleted. Later instalments are sliced against them; correct a line through an amount change or a reversal order instead.'
        USING DETAIL = 'error 51032';
END;
$fn$;

CREATE TRIGGER "trg_InstalmentLineBilling_Immutable"
    AFTER UPDATE ON ${flyway:defaultSchema}."InstalmentLineBilling"
    REFERENCING OLD TABLE AS deleted NEW TABLE AS inserted
    FOR EACH STATEMENT
    EXECUTE FUNCTION ${flyway:defaultSchema}."fn_trg_InstalmentLineBilling_Immutable"();

CREATE TRIGGER "trg_InstalmentLineBilling_Immutable_Delete"
    AFTER DELETE ON ${flyway:defaultSchema}."InstalmentLineBilling"
    REFERENCING OLD TABLE AS deleted
    FOR EACH STATEMENT
    EXECUTE FUNCTION ${flyway:defaultSchema}."fn_trg_InstalmentLineBilling_Immutable"();

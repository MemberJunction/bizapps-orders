-- =============================================================================================
-- PostgreSQL counterpart of V202610230338__v5.39.x__AttendanceStatus_Value_Order.sql
-- =============================================================================================
-- `mj sql-convert --from tsql --to postgres` (MJ CLI 6.1.5) output, unchanged. The T-SQL file's
-- explanation is carried below, under "Other". Schema names are written unquoted, as the converter
-- emits them, so they fold to the lowercase schema a PostgreSQL install uses.
-- =============================================================================================

-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
CREATE SCHEMA IF NOT EXISTS __mj_BizAppsOrders;
SET search_path TO __mj_BizAppsOrders, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE ${mjSchema}."EntityFieldValue"
SET "Sequence" = 1
WHERE "EntityFieldID" = '5214C1CF-7583-469C-AA86-D1699063A784'
  AND "Value" = 'Attended';

UPDATE ${mjSchema}."EntityFieldValue"
SET "Sequence" = 2
WHERE "EntityFieldID" = '5214C1CF-7583-469C-AA86-D1699063A784'
  AND "Value" = 'Cancelled';


-- ===================== Other =====================

-- =============================================================================
-- V202610230338 — Event Order Lines.AttendanceStatus: dropdown order
-- =============================================================================
-- CodeGen orders a value list alphabetically: Attended 1, Cancelled 2,
-- No Show 3, Registered 4. V202609201435 inserted the four values as
-- Registered 1, Attended 2, No Show 3, Cancelled 4, with a fixed ID for
-- Registered and NEWID() for the other three.
--
-- V202609291306 captured CodeGen's re-sort as UPDATEs keyed by row ID. The
-- update to Registered (fixed ID) applies everywhere; the ones to Attended and
-- Cancelled name the IDs the capturing database happened to generate, so on
-- every database built from migrations they match no row. Those databases are
-- left with Attended 2, No Show 3, Cancelled 4, Registered 4: two values share
-- a slot and the dropdown order is not the one CodeGen and the code expect.
-- V202610131506 noted the same two updates and left them out for that reason.
--
-- Hand-written because CodeGen can only emit the ID-keyed form. These key on
-- the field and the value, which are the same on every database. Where CodeGen
-- already corrected the rows (the database that captured V202609291306, or a
-- host where CodeGen has since run), both updates write the value already
-- there. The __mj_UpdatedAt column is set by EntityFieldValue's update trigger.
-- =============================================================================

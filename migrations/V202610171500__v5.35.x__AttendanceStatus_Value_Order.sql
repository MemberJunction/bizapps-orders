-- =============================================================================
-- V202610171500 — Event Order Lines.AttendanceStatus: dropdown order
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

UPDATE [${mjSchema}].[EntityFieldValue]
SET Sequence = 1
WHERE EntityFieldID = '5214C1CF-7583-469C-AA86-D1699063A784'
  AND Value = 'Attended';

UPDATE [${mjSchema}].[EntityFieldValue]
SET Sequence = 2
WHERE EntityFieldID = '5214C1CF-7583-469C-AA86-D1699063A784'
  AND Value = 'Cancelled';

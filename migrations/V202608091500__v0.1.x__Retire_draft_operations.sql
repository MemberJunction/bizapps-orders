-- =====================================================================================================
-- Retire the four remote operations that took an OrderDraft.
--
-- WHY THEY ARE GONE. `OrderDraft` was a framework-free mirror of the order entity, invented because a
-- browser could not save a header and its lines in one act. MJ 6.1's related-record collections and
-- entity-graph save removed that constraint: the browser now builds an `OrderEntity`, attaches lines,
-- and calls `Save()`, and the server subclass runs the identical booking walk it always did. The
-- mirror had no remaining job, and a hand-maintained mirror that nothing needs drifts from the entity
-- silently, in both directions.
--
--   Orders.SaveOrder       -> order.Save()                      (the entity graph writes header + lines)
--   Orders.ConfirmOrder    -> order.Status = 'Confirmed'; Save() (the subclass books inside its transaction)
--   Orders.PreviewOrder    -> Orders.PriceOrder                 (the pricing walk, without the write)
--   Orders.PreviewConfirm  -> Orders.PriceOrder                 (same; the confirm is no longer gated on it)
--
-- `Orders.CreateOrderInState` is not deleted here — it is RENAMED to `Orders.AdvanceOrderState` by
-- metadata/, keeping its ID, because the half of it that a save cannot do (marking a set of lines
-- fulfilled, and deciding whether the header may move with some still Pending) is still real work.
--
-- WHY A MIGRATION RATHER THAN metadata/. `mj sync push` reconciles the rows it is GIVEN; a row deleted
-- from the JSON is simply a row it is never told about, so it would sit in every existing database as
-- an Active operation with no code behind it. Calling one would fail at class resolution — the least
-- useful moment to find out. Deleting is an act, so it is written as one.
--
-- Idempotent, and safe on a database that never had these rows.
-- =====================================================================================================

DELETE FROM [__mj].[RemoteOperation]
 WHERE [ID] IN (
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C401',  -- Orders.SaveOrder
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C402',  -- Orders.PreviewOrder
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C403',  -- Orders.PreviewConfirm
        'C2D5F3B1-7E4A-4B29-8F63-1D2E6B92C404'   -- Orders.ConfirmOrder
       );

-- Belt and braces: an install that seeded these under different IDs (an early rebuild, a hand-run
-- sync) is still carrying dead rows, and the operation KEY is what a caller resolves by.
DELETE FROM [__mj].[RemoteOperation]
 WHERE [OperationKey] IN (
        'Orders.SaveOrder',
        'Orders.PreviewOrder',
        'Orders.PreviewConfirm',
        'Orders.ConfirmOrder'
       );

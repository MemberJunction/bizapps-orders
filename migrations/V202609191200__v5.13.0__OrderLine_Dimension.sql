-- OrderLine.DimensionID + OrderLine.DimensionValueID
--
-- One GL dimension tag, stated on the order line itself, carried onto every journal entry line the
-- line produces (golive #236). Order lines were never tagged, so every order-originated entry
-- reached the ledger with no dimensions at all.
--
-- BOTH COLUMNS, NOT ONE. A dimension names an AXIS; the value names the point on it. A journal
-- entry line's tag is the pair — __mj_BizAppsAccounting.JournalEntryLineDimension carries
-- DimensionID and DimensionValueID together, both NOT NULL — so a DimensionID on its own could not
-- be passed down to the ledger. CK_OrderLine_DimensionPair below makes "both or neither" a database
-- rule rather than a convention the UI is trusted to keep.
--
-- Foreign keys reach into __mj_BizAppsAccounting, which is where accounting owns the vocabulary.
-- The same cross-schema pair already exists on OrderLineDimension, so this adds no new coupling.
--
-- RUN CODEGEN AFTER THIS so vwOrderLines, the CRUD procs and the entity subclasses pick the columns
-- up. No __mj_CreatedAt/__mj_UpdatedAt and no FK indexes here — CodeGen emits both.

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD DimensionID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_OrderLine_Dimension
            FOREIGN KEY REFERENCES __mj_BizAppsAccounting.Dimension(ID),
        DimensionValueID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_OrderLine_DimensionValue
            FOREIGN KEY REFERENCES __mj_BizAppsAccounting.DimensionValue(ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT CK_OrderLine_DimensionPair
        CHECK (
            (DimensionID IS NULL AND DimensionValueID IS NULL)
            OR (DimensionID IS NOT NULL AND DimensionValueID IS NOT NULL)
        );
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The GL dimension this line is tagged on — the analysis axis, from __mj_BizAppsAccounting.Dimension. NULL leaves the line untagged, which books a valid entry that simply cannot be reported on by dimension. Set together with DimensionValueID (CK_OrderLine_DimensionPair).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'OrderLine',
    @level2type = N'COLUMN', @level2name = N'DimensionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The value of DimensionID this line is tagged with, from __mj_BizAppsAccounting.DimensionValue. Carried with DimensionID onto every journal entry line the order line produces. Set together with DimensionID (CK_OrderLine_DimensionPair).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'OrderLine',
    @level2type = N'COLUMN', @level2name = N'DimensionValueID';
GO

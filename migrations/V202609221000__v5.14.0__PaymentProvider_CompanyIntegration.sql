-- =============================================================================
-- PaymentProvider.CompanyIntegrationID — which MJ Company Integration a provider row uses.
--
-- Added for the Bill.com rail (golive #146/#147/#148, design D-B4). The published connector
-- (@memberjunction/connector-bill-com) resolves its own credentials from the MJ: Company Integrations
-- row and the MJ: Credentials row behind it, so Orders stores a POINTER to that row and never a
-- secret. Existing Stripe/Manual/StoredValue rows keep resolving through CredentialsRef and are
-- untouched; the column is nullable.
--
-- Idempotent: safe on a database that already has the column.
-- =============================================================================
IF COL_LENGTH('${flyway:defaultSchema}.PaymentProvider', 'CompanyIntegrationID') IS NULL
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[PaymentProvider]
        ADD [CompanyIntegrationID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_PaymentProvider_CompanyIntegration]
            REFERENCES [__mj].[CompanyIntegration]([ID]);
END;
GO

IF NOT EXISTS (
    SELECT 1
      FROM sys.extended_properties ep
      JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
     WHERE ep.name = 'MS_Description'
       AND c.name = 'CompanyIntegrationID'
       AND ep.major_id = OBJECT_ID('${flyway:defaultSchema}.PaymentProvider')
)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The MJ Company Integration whose connector and credential this provider uses (Bill.com). NULL for providers that resolve credentials through CredentialsRef. A pointer, never a secret.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProvider',
    @level2type = N'COLUMN', @level2name = N'CompanyIntegrationID';
GO

-- CodeGen output for the new EntityField is folded below this banner once the migration has been
-- applied to a development database and `mj codegen` has run (see docs/database-migrations.md).
-- Until then the server reads the column through RunView, which needs no generated getter.

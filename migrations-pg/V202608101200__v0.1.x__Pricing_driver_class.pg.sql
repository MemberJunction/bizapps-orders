-- =====================================================================================================
-- PostgreSQL counterpart of V202608101200__v0.1.x__Pricing_driver_class.sql.
--
-- See the T-SQL file for why the column exists and how it resolves. Same four columns, same NULL
-- default meaning "no plugin"; only the DDL dialect and the comment mechanism differ.
-- =====================================================================================================

ALTER TABLE "__mj_BizAppsOrders"."Product"            ADD COLUMN IF NOT EXISTS "PricingDriverClass" VARCHAR(255) NULL;
ALTER TABLE "__mj_BizAppsOrders"."ProductCategory"    ADD COLUMN IF NOT EXISTS "PricingDriverClass" VARCHAR(255) NULL;
ALTER TABLE "__mj_BizAppsOrders"."ProductType"        ADD COLUMN IF NOT EXISTS "PricingDriverClass" VARCHAR(255) NULL;
ALTER TABLE "__mj_BizAppsOrders"."OrderCompanyPolicy" ADD COLUMN IF NOT EXISTS "PricingDriverClass" VARCHAR(255) NULL;

COMMENT ON COLUMN "__mj_BizAppsOrders"."Product"."PricingDriverClass" IS
  'ClassFactory key of a BasePriceResolver subclass that prices this, or NULL for the standard metadata-driven walk. Resolved most-specific-first: product, then up the category chain, then the type, then the company policy. A client may price LOCALLY only when every level is NULL; anything else escalates to the server, because a plugin''s answer cannot be reproduced from metadata.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."ProductCategory"."PricingDriverClass" IS
  'ClassFactory key of a BasePriceResolver subclass for every product in this category (and, unless overridden, its child categories), or NULL.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."ProductType"."PricingDriverClass" IS
  'ClassFactory key of a BasePriceResolver subclass for every product of this type, or NULL. The natural home for behaviour-wide pricing such as usage metering.';

COMMENT ON COLUMN "__mj_BizAppsOrders"."OrderCompanyPolicy"."PricingDriverClass" IS
  'ClassFactory key of this company''s house BasePriceResolver, or NULL. Where every plugin registered before this column existed was keyed (Company:<id>).';

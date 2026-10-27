-- =============================================================================================
-- PostgreSQL counterpart of V202610271200__v5.39.x__OrderHeader_ApprovalTask_FK.sql
-- =============================================================================================
-- Written by hand from the T-SQL: one foreign key and one column comment. CodeGen's output for
-- the change is not here; a PostgreSQL host runs `mj codegen` after installing.
-- Schema names are written unquoted, as the converter emits them, so they fold to the lowercase
-- schema a PostgreSQL install uses.
-- =============================================================================================

ALTER TABLE __mj_BizAppsOrders."OrderHeader"
    ADD CONSTRAINT "FK_OrderHeader_ApprovalTask"
        FOREIGN KEY ("ApprovalTaskID") REFERENCES __mj_BizAppsTasks."Task"("ID");

COMMENT ON COLUMN __mj_BizAppsOrders."OrderHeader"."ApprovalTaskID" IS 'The order''s most recent open approval task in the tasks app, raised for a Pending concession. A convenience pointer: Task Links carry the authoritative link between a task and the record it decides.';

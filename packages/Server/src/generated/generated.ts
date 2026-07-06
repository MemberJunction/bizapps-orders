/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { mjBizAppsOrdersOrderLineEntity, mjBizAppsOrdersOrderEntity, mjBizAppsOrdersProductCategoryEntity, mjBizAppsOrdersProductTypeEntity, mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Lines
//****************************************************************************
@ObjectType({ description: `A line item on an order. Line amount = Quantity * UnitPrice.` })
export class mjBizAppsOrdersOrderLine_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field(() => Int, {description: `Order-scoped line sequence (1..n), unique within the order.`}) 
    LineNumber: number;
        
    @Field(() => Float, {description: `Quantity ordered (> 0).`}) 
    Quantity: number;
        
    @Field(() => Float, {description: `Unit price (>= 0). Multiplied by Quantity to get the line amount booked to revenue.`}) 
    UnitPrice: number;
        
    @Field({nullable: true, description: `Optional free-text description for the line.`}) 
    @MaxLength(500)
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Product: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Lines
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderLineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field(() => Int, { nullable: true })
    LineNumber?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Lines
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderLineInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field(() => Int, { nullable: true })
    LineNumber?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Lines
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderLineViewResult {
    @Field(() => [mjBizAppsOrdersOrderLine_])
    Results: mjBizAppsOrdersOrderLine_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsOrdersOrderLine_)
export class mjBizAppsOrdersOrderLineResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderLineViewResult)
    async RunmjBizAppsOrdersOrderLineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderLineViewResult)
    async RunmjBizAppsOrdersOrderLineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderLineViewResult)
    async RunmjBizAppsOrdersOrderLineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Lines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderLine_, { nullable: true })
    async mjBizAppsOrdersOrderLine(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderLine_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderLine_)
    async CreatemjBizAppsOrdersOrderLine(
        @Arg('input', () => CreatemjBizAppsOrdersOrderLineInput) input: CreatemjBizAppsOrdersOrderLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Lines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderLine_)
    async UpdatemjBizAppsOrdersOrderLine(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderLineInput) input: UpdatemjBizAppsOrdersOrderLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Lines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderLine_)
    async DeletemjBizAppsOrdersOrderLine(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Lines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Orders
//****************************************************************************
@ObjectType({ description: `An order header. On the FIRST transition to Confirmed, a balanced journal entry is booked into BizApps Accounting. No CompanyID (multi-company via each line\'s resolved GLAccount.CompanyID); no currency (FX deferred v1).` })
export class mjBizAppsOrdersOrder_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable order identifier. Unique.`}) 
    @MaxLength(40)
    OrderNumber: string;
        
    @Field({description: `Effective date of the order; used as the journal entry EffectiveDate and the as-of date for GL-account link resolution.`}) 
    OrderDate: Date;
        
    @Field({description: `Draft | Quoted | Confirmed | Posted | Fulfilled | Voided. Voided is reachable only from Draft/Quoted; the JE fires once on the first Confirmed.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer. Nullable.`}) 
    @MaxLength(36)
    CustomerOrganizationID?: string;
        
    @Field({nullable: true, description: `Optional free-text description / memo for the order.`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked on Confirm. Non-null means the JE has already been booked (idempotency guard).`}) 
    @MaxLength(36)
    JournalEntryID?: string;
        
    @Field({nullable: true, description: `UTC timestamp of the first transition to Confirmed.`}) 
    ConfirmedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_OrderIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Orders
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderNumber?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CustomerOrganizationID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    JournalEntryID: string | null;

    @Field({ nullable: true })
    ConfirmedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Orders
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderNumber?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CustomerOrganizationID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    JournalEntryID?: string | null;

    @Field({ nullable: true })
    ConfirmedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Orders
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderViewResult {
    @Field(() => [mjBizAppsOrdersOrder_])
    Results: mjBizAppsOrdersOrder_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsOrdersOrder_)
export class mjBizAppsOrdersOrderResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderViewResult)
    async RunmjBizAppsOrdersOrderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderViewResult)
    async RunmjBizAppsOrdersOrderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderViewResult)
    async RunmjBizAppsOrdersOrderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Orders';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrder_, { nullable: true })
    async mjBizAppsOrdersOrder(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrder_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrders')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Orders', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_OrderIDArray(@Root() mjbizappsordersorder_: mjBizAppsOrdersOrder_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('OrderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorder_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersOrder_)
    async CreatemjBizAppsOrdersOrder(
        @Arg('input', () => CreatemjBizAppsOrdersOrderInput) input: CreatemjBizAppsOrdersOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Orders', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrder_)
    async UpdatemjBizAppsOrdersOrder(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderInput) input: UpdatemjBizAppsOrdersOrderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Orders', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrder_)
    async DeletemjBizAppsOrdersOrder(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Orders', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Product Categories
//****************************************************************************
@ObjectType({ description: `Hierarchical grouping of products; the account resolver walks the ParentID tree upward.` })
export class mjBizAppsOrdersProductCategory_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the category.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field({nullable: true, description: `Optional description of the category.`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this category is active and selectable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field(() => [mjBizAppsOrdersProduct_])
    mjBizAppsOrdersProducts_ProductCategoryIDArray: mjBizAppsOrdersProduct_[]; // Link to mjBizAppsOrdersProducts
    
    @Field(() => [mjBizAppsOrdersProductCategory_])
    mjBizAppsOrdersProductCategories_ParentIDArray: mjBizAppsOrdersProductCategory_[]; // Link to mjBizAppsOrdersProductCategories
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Categories
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Categories
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Product Categories
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductCategoryViewResult {
    @Field(() => [mjBizAppsOrdersProductCategory_])
    Results: mjBizAppsOrdersProductCategory_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsOrdersProductCategory_)
export class mjBizAppsOrdersProductCategoryResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductCategoryViewResult)
    async RunmjBizAppsOrdersProductCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductCategoryViewResult)
    async RunmjBizAppsOrdersProductCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductCategoryViewResult)
    async RunmjBizAppsOrdersProductCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Product Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProductCategory_, { nullable: true })
    async mjBizAppsOrdersProductCategory(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProductCategory_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductCategories')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersProduct_])
    async mjBizAppsOrdersProducts_ProductCategoryIDArray(@Root() mjbizappsordersproductcategory_: mjBizAppsOrdersProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProducts')} WHERE ${provider.QuoteIdentifier('ProductCategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproductcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProductCategory_])
    async mjBizAppsOrdersProductCategories_ParentIDArray(@Root() mjbizappsordersproductcategory_: mjBizAppsOrdersProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductCategories')} WHERE ${provider.QuoteIdentifier('ParentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproductcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersProductCategory_)
    async CreatemjBizAppsOrdersProductCategory(
        @Arg('input', () => CreatemjBizAppsOrdersProductCategoryInput) input: CreatemjBizAppsOrdersProductCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Product Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProductCategory_)
    async UpdatemjBizAppsOrdersProductCategory(
        @Arg('input', () => UpdatemjBizAppsOrdersProductCategoryInput) input: UpdatemjBizAppsOrdersProductCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Product Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProductCategory_)
    async DeletemjBizAppsOrdersProductCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Product Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Product Types
//****************************************************************************
@ObjectType({ description: `Classifies products (e.g. Physical Good, Service, Subscription).` })
export class mjBizAppsOrdersProductType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the product type. Unique.`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Optional description of the product type.`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this type is active and selectable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersProduct_])
    mjBizAppsOrdersProducts_ProductTypeIDArray: mjBizAppsOrdersProduct_[]; // Link to mjBizAppsOrdersProducts
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Product Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductTypeViewResult {
    @Field(() => [mjBizAppsOrdersProductType_])
    Results: mjBizAppsOrdersProductType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsOrdersProductType_)
export class mjBizAppsOrdersProductTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductTypeViewResult)
    async RunmjBizAppsOrdersProductTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductTypeViewResult)
    async RunmjBizAppsOrdersProductTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductTypeViewResult)
    async RunmjBizAppsOrdersProductTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Product Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProductType_, { nullable: true })
    async mjBizAppsOrdersProductType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProductType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersProduct_])
    async mjBizAppsOrdersProducts_ProductTypeIDArray(@Root() mjbizappsordersproducttype_: mjBizAppsOrdersProductType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProducts')} WHERE ${provider.QuoteIdentifier('ProductTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproducttype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersProductType_)
    async CreatemjBizAppsOrdersProductType(
        @Arg('input', () => CreatemjBizAppsOrdersProductTypeInput) input: CreatemjBizAppsOrdersProductTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Product Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProductType_)
    async UpdatemjBizAppsOrdersProductType(
        @Arg('input', () => UpdatemjBizAppsOrdersProductTypeInput) input: UpdatemjBizAppsOrdersProductTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Product Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProductType_)
    async DeletemjBizAppsOrdersProductType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Product Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Products
//****************************************************************************
@ObjectType({ description: `A catalog item that can be ordered. GL accounts are NOT stored here — accounting\'s GLAccountLink points at Product rows (role-mapped, date-effective).` })
export class mjBizAppsOrdersProduct_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the product.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field() 
    @MaxLength(36)
    ProductTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ProductCategoryID?: string;
        
    @Field({description: `Immediate (Dr AR / Cr Sales) or Deferred (Dr AR / Cr Deferred Revenue). Drives the credit side of the order-booking journal entry.`}) 
    @MaxLength(20)
    RevenueRecognitionType: string;
        
    @Field({nullable: true, description: `Optional description of the product.`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this product is active and orderable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    ProductType: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ProductCategory?: string;
        
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_ProductIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Products
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ProductTypeID?: string;

    @Field({ nullable: true })
    ProductCategoryID: string | null;

    @Field({ nullable: true })
    RevenueRecognitionType?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Products
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ProductTypeID?: string;

    @Field({ nullable: true })
    ProductCategoryID?: string | null;

    @Field({ nullable: true })
    RevenueRecognitionType?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Products
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductViewResult {
    @Field(() => [mjBizAppsOrdersProduct_])
    Results: mjBizAppsOrdersProduct_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsOrdersProduct_)
export class mjBizAppsOrdersProductResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductViewResult)
    async RunmjBizAppsOrdersProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductViewResult)
    async RunmjBizAppsOrdersProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductViewResult)
    async RunmjBizAppsOrdersProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProduct_, { nullable: true })
    async mjBizAppsOrdersProduct(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProduct_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProducts')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Products', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_ProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('ProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersProduct_)
    async CreatemjBizAppsOrdersProduct(
        @Arg('input', () => CreatemjBizAppsOrdersProductInput) input: CreatemjBizAppsOrdersProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProduct_)
    async UpdatemjBizAppsOrdersProduct(
        @Arg('input', () => UpdatemjBizAppsOrdersProductInput) input: UpdatemjBizAppsOrdersProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProduct_)
    async DeletemjBizAppsOrdersProduct(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Products', key, options, provider, userPayload, pubSub);
    }
    
}
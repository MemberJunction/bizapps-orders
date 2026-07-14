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


import { mjBizAppsOrdersCustomerPaymentMethodEntity, mjBizAppsOrdersOrderLineEntity, mjBizAppsOrdersOrderSequenceEntity, mjBizAppsOrdersOrderEntity, mjBizAppsOrdersPaymentIntentEntity, mjBizAppsOrdersPaymentLineEntity, mjBizAppsOrdersPaymentProviderEntity, mjBizAppsOrdersPaymentSequenceEntity, mjBizAppsOrdersPaymentTermsTypeEntity, mjBizAppsOrdersPaymentEntity, mjBizAppsOrdersProductCategoryEntity, mjBizAppsOrdersProductTypeEntity, mjBizAppsOrdersProductEntity } from '@mj-biz-apps/orders-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Customer Payment Methods
//****************************************************************************
@ObjectType({ description: `A stored payment method token for a customer (BO-D46). Provider token references only — never card data.` })
export class mjBizAppsOrdersCustomerPaymentMethod_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer who owns this method.`}) 
    @MaxLength(36)
    CustomerOrganizationID: string;
        
    @Field() 
    @MaxLength(36)
    PaymentProviderID: string;
        
    @Field({nullable: true, description: `Provider-side customer identifier (e.g. Stripe cus_...).`}) 
    @MaxLength(100)
    ProviderCustomerID?: string;
        
    @Field({nullable: true, description: `Provider-side payment method token (e.g. Stripe pm_...).`}) 
    @MaxLength(100)
    ProviderPaymentMethodID?: string;
        
    @Field({nullable: true, description: `Kind of method (card, us_bank_account, ...). Provider vocabulary, informational.`}) 
    @MaxLength(20)
    MethodType?: string;
        
    @Field({nullable: true, description: `Card brand for display (Visa, Mastercard, ...).`}) 
    @MaxLength(40)
    Brand?: string;
        
    @Field({nullable: true, description: `Last four digits for display. Never more.`}) 
    @MaxLength(4)
    Last4?: string;
        
    @Field(() => Int, {nullable: true, description: `Card expiry month (1-12) for display/expiry warnings.`}) 
    ExpiryMonth?: number;
        
    @Field(() => Int, {nullable: true, description: `Card expiry year for display/expiry warnings.`}) 
    ExpiryYear?: number;
        
    @Field(() => Boolean, {description: `Whether this is the customer's default method for charge-on-file.`}) 
    IsDefault: boolean;
        
    @Field(() => Boolean, {description: `Whether this method is active/usable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    PaymentProvider: string;
        
    @Field(() => [mjBizAppsOrdersPayment_])
    mjBizAppsOrdersPayments_PaymentMethodIDArray: mjBizAppsOrdersPayment_[]; // Link to mjBizAppsOrdersPayments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Customer Payment Methods
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersCustomerPaymentMethodInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CustomerOrganizationID?: string;

    @Field({ nullable: true })
    PaymentProviderID?: string;

    @Field({ nullable: true })
    ProviderCustomerID: string | null;

    @Field({ nullable: true })
    ProviderPaymentMethodID: string | null;

    @Field({ nullable: true })
    MethodType: string | null;

    @Field({ nullable: true })
    Brand: string | null;

    @Field({ nullable: true })
    Last4: string | null;

    @Field(() => Int, { nullable: true })
    ExpiryMonth: number | null;

    @Field(() => Int, { nullable: true })
    ExpiryYear: number | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Customer Payment Methods
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersCustomerPaymentMethodInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CustomerOrganizationID?: string;

    @Field({ nullable: true })
    PaymentProviderID?: string;

    @Field({ nullable: true })
    ProviderCustomerID?: string | null;

    @Field({ nullable: true })
    ProviderPaymentMethodID?: string | null;

    @Field({ nullable: true })
    MethodType?: string | null;

    @Field({ nullable: true })
    Brand?: string | null;

    @Field({ nullable: true })
    Last4?: string | null;

    @Field(() => Int, { nullable: true })
    ExpiryMonth?: number | null;

    @Field(() => Int, { nullable: true })
    ExpiryYear?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Customer Payment Methods
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersCustomerPaymentMethodViewResult {
    @Field(() => [mjBizAppsOrdersCustomerPaymentMethod_])
    Results: mjBizAppsOrdersCustomerPaymentMethod_[];

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

@Resolver(mjBizAppsOrdersCustomerPaymentMethod_)
export class mjBizAppsOrdersCustomerPaymentMethodResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersCustomerPaymentMethodViewResult)
    async RunmjBizAppsOrdersCustomerPaymentMethodViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersCustomerPaymentMethodViewResult)
    async RunmjBizAppsOrdersCustomerPaymentMethodViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersCustomerPaymentMethodViewResult)
    async RunmjBizAppsOrdersCustomerPaymentMethodDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Customer Payment Methods';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersCustomerPaymentMethod_, { nullable: true })
    async mjBizAppsOrdersCustomerPaymentMethod(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersCustomerPaymentMethod_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Customer Payment Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwCustomerPaymentMethods')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Customer Payment Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Customer Payment Methods', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPayment_])
    async mjBizAppsOrdersPayments_PaymentMethodIDArray(@Root() mjbizappsorderscustomerpaymentmethod_: mjBizAppsOrdersCustomerPaymentMethod_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPayments')} WHERE ${provider.QuoteIdentifier('PaymentMethodID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderscustomerpaymentmethod_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersCustomerPaymentMethod_)
    async CreatemjBizAppsOrdersCustomerPaymentMethod(
        @Arg('input', () => CreatemjBizAppsOrdersCustomerPaymentMethodInput) input: CreatemjBizAppsOrdersCustomerPaymentMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Customer Payment Methods', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersCustomerPaymentMethod_)
    async UpdatemjBizAppsOrdersCustomerPaymentMethod(
        @Arg('input', () => UpdatemjBizAppsOrdersCustomerPaymentMethodInput) input: UpdatemjBizAppsOrdersCustomerPaymentMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Customer Payment Methods', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersCustomerPaymentMethod_)
    async DeletemjBizAppsOrdersCustomerPaymentMethod(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Customer Payment Methods', key, options, provider, userPayload, pubSub);
    }
    
}

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
        
    @Field(() => Float, {description: `Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).`}) 
    DiscountPct: number;
        
    @Field(() => Float, {nullable: true, description: `Engine-computed stored net line total = Quantity * UnitPrice * (1 - DiscountPct). Frozen after Confirm.`}) 
    LineTotalNet?: number;
        
    @Field(() => Float, {description: `Tax amount for this line. 0 until the tax subsystem lands (O4).`}) 
    LineTax: number;
        
    @Field(() => Float, {nullable: true, description: `Engine-computed stored gross line total = LineTotalNet + LineTax. Frozen after Confirm.`}) 
    LineTotalGross?: number;
        
    @Field({nullable: true, description: `Start of the service period for Deferred products (UPD-2 service-period recognition shape). Nullable.`}) 
    ServicePeriodStart?: Date;
        
    @Field({nullable: true, description: `End of the service period for Deferred products (>= ServicePeriodStart). Nullable.`}) 
    ServicePeriodEnd?: Date;
        
    @Field({nullable: true, description: `Pending | Fulfilled | Returned. NULL when the product type does not require fulfillment. The one line column a Fulfiller may change on Confirmed+ orders (trigger carve-out).`}) 
    @MaxLength(20)
    FulfillmentStatus?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ReversesOrderLineID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SourceBundleProductID?: string;
        
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
        
    @Field({nullable: true}) 
    @MaxLength(200)
    SourceBundleProduct?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootReversesOrderLineID?: string;
        
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    mjBizAppsOrdersPaymentLines_OrderLineIDArray: mjBizAppsOrdersPaymentLine_[]; // Link to mjBizAppsOrdersPaymentLines
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_ReversesOrderLineIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
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

    @Field(() => Float, { nullable: true })
    DiscountPct?: number;

    @Field(() => Float, { nullable: true })
    LineTotalNet: number | null;

    @Field(() => Float, { nullable: true })
    LineTax?: number;

    @Field(() => Float, { nullable: true })
    LineTotalGross: number | null;

    @Field({ nullable: true })
    ServicePeriodStart: Date | null;

    @Field({ nullable: true })
    ServicePeriodEnd: Date | null;

    @Field({ nullable: true })
    FulfillmentStatus: string | null;

    @Field({ nullable: true })
    ReversesOrderLineID: string | null;

    @Field({ nullable: true })
    SourceBundleProductID: string | null;

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

    @Field(() => Float, { nullable: true })
    DiscountPct?: number;

    @Field(() => Float, { nullable: true })
    LineTotalNet?: number | null;

    @Field(() => Float, { nullable: true })
    LineTax?: number;

    @Field(() => Float, { nullable: true })
    LineTotalGross?: number | null;

    @Field({ nullable: true })
    ServicePeriodStart?: Date | null;

    @Field({ nullable: true })
    ServicePeriodEnd?: Date | null;

    @Field({ nullable: true })
    FulfillmentStatus?: string | null;

    @Field({ nullable: true })
    ReversesOrderLineID?: string | null;

    @Field({ nullable: true })
    SourceBundleProductID?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentLine_])
    async mjBizAppsOrdersPaymentLines_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentLines')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_ReversesOrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('ReversesOrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for MJ_BizApps_Orders: Order Sequences
//****************************************************************************
@ObjectType({ description: `Global singleton counter (ID=1) minting gap-conscious ORD-{seq} order numbers. Consumed only by the entity server.` })
export class mjBizAppsOrdersOrderSequence_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {description: `The next order sequence number to assign.`}) 
    NextSequenceNumber: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Sequences
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderSequenceInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    NextSequenceNumber?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Sequences
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderSequenceInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    NextSequenceNumber?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Sequences
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderSequenceViewResult {
    @Field(() => [mjBizAppsOrdersOrderSequence_])
    Results: mjBizAppsOrdersOrderSequence_[];

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

@Resolver(mjBizAppsOrdersOrderSequence_)
export class mjBizAppsOrdersOrderSequenceResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderSequenceViewResult)
    async RunmjBizAppsOrdersOrderSequenceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderSequenceViewResult)
    async RunmjBizAppsOrdersOrderSequenceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderSequenceViewResult)
    async RunmjBizAppsOrdersOrderSequenceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Sequences';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderSequence_, { nullable: true })
    async mjBizAppsOrdersOrderSequence(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderSequence_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Sequences', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderSequences')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Sequences', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Sequences', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderSequence_)
    async CreatemjBizAppsOrdersOrderSequence(
        @Arg('input', () => CreatemjBizAppsOrdersOrderSequenceInput) input: CreatemjBizAppsOrdersOrderSequenceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Sequences', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderSequence_)
    async UpdatemjBizAppsOrdersOrderSequence(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderSequenceInput) input: UpdatemjBizAppsOrdersOrderSequenceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Sequences', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderSequence_)
    async DeletemjBizAppsOrdersOrderSequence(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Sequences', key, options, provider, userPayload, pubSub);
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
        
    @Field({description: `Sale | Return | Cancellation | Amendment | CreditMemoOrder. Non-Sale types are the correction/reversal document family (BO-D9/D15).`}) 
    @MaxLength(20)
    OrderType: string;
        
    @Field({description: `Effective date of the order; used as the journal entry EffectiveDate and the as-of date for GL-account link resolution.`}) 
    OrderDate: Date;
        
    @Field({description: `Draft | Quoted | Confirmed | Posted | Fulfilled | Voided. Voided is reachable only from Draft/Quoted; the JE fires once on the first Confirmed.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer. Nullable.`}) 
    @MaxLength(36)
    CustomerOrganizationID?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Person — the buyer/contact person at the customer organization. Nullable.`}) 
    @MaxLength(36)
    CustomerPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SalesRepUserID?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.`}) 
    @MaxLength(36)
    BillToAddressID?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.`}) 
    @MaxLength(36)
    ShipToAddressID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PaymentTermsTypeID?: string;
        
    @Field(() => Float, {nullable: true, description: `Engine-materialized order total = SUM(OrderLine.LineTotalGross). Never user-entered; frozen after Confirm.`}) 
    TotalGross?: number;
        
    @Field(() => Float, {description: `Engine-materialized total cash applied to this order = SUM(posted PaymentLine.Amount). Never user-entered.`}) 
    AmountPaid: number;
        
    @Field(() => Float, {nullable: true, description: `Engine-materialized open balance = TotalGross - AmountPaid. Negative means a credit memo owed to the customer.`}) 
    Balance?: number;
        
    @Field({nullable: true, description: `Payment due date, derived at Confirm/Post from PaymentTermsType.NetDays (posting date + net days) when not manually supplied. Editable override.`}) 
    DueDate?: Date;
        
    @Field({description: `Unpaid | PartiallyPaid | Paid | Overdue | WrittenOff. Engine-derived from AmountPaid vs TotalGross; Overdue is time-derived in views/UI, WrittenOff is an explicit action.`}) 
    @MaxLength(20)
    PaymentStatus: string;
        
    @Field({nullable: true, description: `External document/invoice number for downstream systems (e.g. bill.com sync, UPD-1). Free-form; may equal OrderNumber. Not unique pending the dual-numbering decision.`}) 
    @MaxLength(80)
    ExternalDocumentNumber?: string;
        
    @Field({nullable: true, description: `UTC timestamp of the transition to Posted — the issue/tax-point date of the invoice.`}) 
    PostedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PostedByUserID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ReversesOrderID?: string;
        
    @Field({nullable: true, description: `Reason this order reverses another (required by validation when ReversesOrderID is set).`}) 
    ReversalReason?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to the governing contract record (contracts envelope, BO-D21; ownership pending the AIDP-contracts decision). Nullable.`}) 
    @MaxLength(36)
    ContractID?: string;
        
    @Field({nullable: true, description: `Customer-requested delivery/service date. Informational.`}) 
    RequestedDeliveryDate?: Date;
        
    @Field({nullable: true, description: `Optional free-text description / memo for the order.`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Internal notes on the order (Description is the customer-facing memo).`}) 
    Notes?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked on Confirm. Non-null means the JE has already been booked (idempotency guard).`}) 
    @MaxLength(36)
    JournalEntryID?: string;
        
    @Field({nullable: true, description: `UTC timestamp of the first transition to Confirmed.`}) 
    ConfirmedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    SalesRepUser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentTermsType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    PostedByUser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootReversesOrderID?: string;
        
    @Field(() => [mjBizAppsOrdersOrder_])
    mjBizAppsOrdersOrders_ReversesOrderIDArray: mjBizAppsOrdersOrder_[]; // Link to mjBizAppsOrdersOrders
    
    @Field(() => [mjBizAppsOrdersPaymentIntent_])
    mjBizAppsOrdersPaymentIntents_OrderIDArray: mjBizAppsOrdersPaymentIntent_[]; // Link to mjBizAppsOrdersPaymentIntents
    
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    mjBizAppsOrdersPaymentLines_OrderIDArray: mjBizAppsOrdersPaymentLine_[]; // Link to mjBizAppsOrdersPaymentLines
    
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
    OrderType?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CustomerOrganizationID: string | null;

    @Field({ nullable: true })
    CustomerPersonID: string | null;

    @Field({ nullable: true })
    SalesRepUserID: string | null;

    @Field({ nullable: true })
    BillToAddressID: string | null;

    @Field({ nullable: true })
    ShipToAddressID: string | null;

    @Field({ nullable: true })
    PaymentTermsTypeID: string | null;

    @Field(() => Float, { nullable: true })
    TotalGross: number | null;

    @Field(() => Float, { nullable: true })
    AmountPaid?: number;

    @Field(() => Float, { nullable: true })
    Balance: number | null;

    @Field({ nullable: true })
    DueDate: Date | null;

    @Field({ nullable: true })
    PaymentStatus?: string;

    @Field({ nullable: true })
    ExternalDocumentNumber: string | null;

    @Field({ nullable: true })
    PostedAt: Date | null;

    @Field({ nullable: true })
    PostedByUserID: string | null;

    @Field({ nullable: true })
    ReversesOrderID: string | null;

    @Field({ nullable: true })
    ReversalReason: string | null;

    @Field({ nullable: true })
    ContractID: string | null;

    @Field({ nullable: true })
    RequestedDeliveryDate: Date | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Notes: string | null;

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
    OrderType?: string;

    @Field({ nullable: true })
    OrderDate?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CustomerOrganizationID?: string | null;

    @Field({ nullable: true })
    CustomerPersonID?: string | null;

    @Field({ nullable: true })
    SalesRepUserID?: string | null;

    @Field({ nullable: true })
    BillToAddressID?: string | null;

    @Field({ nullable: true })
    ShipToAddressID?: string | null;

    @Field({ nullable: true })
    PaymentTermsTypeID?: string | null;

    @Field(() => Float, { nullable: true })
    TotalGross?: number | null;

    @Field(() => Float, { nullable: true })
    AmountPaid?: number;

    @Field(() => Float, { nullable: true })
    Balance?: number | null;

    @Field({ nullable: true })
    DueDate?: Date | null;

    @Field({ nullable: true })
    PaymentStatus?: string;

    @Field({ nullable: true })
    ExternalDocumentNumber?: string | null;

    @Field({ nullable: true })
    PostedAt?: Date | null;

    @Field({ nullable: true })
    PostedByUserID?: string | null;

    @Field({ nullable: true })
    ReversesOrderID?: string | null;

    @Field({ nullable: true })
    ReversalReason?: string | null;

    @Field({ nullable: true })
    ContractID?: string | null;

    @Field({ nullable: true })
    RequestedDeliveryDate?: Date | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersOrder_])
    async mjBizAppsOrdersOrders_ReversesOrderIDArray(@Root() mjbizappsordersorder_: mjBizAppsOrdersOrder_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrders')} WHERE ${provider.QuoteIdentifier('ReversesOrderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorder_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentIntent_])
    async mjBizAppsOrdersPaymentIntents_OrderIDArray(@Root() mjbizappsordersorder_: mjBizAppsOrdersOrder_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Intents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentIntents')} WHERE ${provider.QuoteIdentifier('OrderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Intents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorder_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Intents', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentLine_])
    async mjBizAppsOrdersPaymentLines_OrderIDArray(@Root() mjbizappsordersorder_: mjBizAppsOrdersOrder_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentLines')} WHERE ${provider.QuoteIdentifier('OrderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorder_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Lines', rows, this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for MJ_BizApps_Orders: Payment Intents
//****************************************************************************
@ObjectType({ description: `Provider-side collection state (BO-D26; Stripe-shaped). The Manual provider skips intents entirely.` })
export class mjBizAppsOrdersPaymentIntent_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PaymentProviderID: string;
        
    @Field({description: `Provider-side intent identifier (e.g. Stripe pi_...). Unique.`}) 
    @MaxLength(100)
    ProviderIntentID: string;
        
    @Field({description: `RequiresPayment | Processing | Succeeded | Canceled | Failed. Mirrors the provider lifecycle.`}) 
    @MaxLength(30)
    Status: string;
        
    @Field(() => Float, {description: `Amount being collected.`}) 
    Amount: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrderID?: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.`}) 
    @MaxLength(36)
    CustomerOrganizationID?: string;
        
    @Field({nullable: true, description: `Last processed provider webhook event id — the idempotency key (unique when present).`}) 
    @MaxLength(100)
    ProviderEventID?: string;
        
    @Field({nullable: true, description: `UTC timestamp of the last provider event applied to this intent.`}) 
    LastEventAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    PaymentProvider: string;
        
    @Field(() => [mjBizAppsOrdersPayment_])
    mjBizAppsOrdersPayments_PaymentIntentIDArray: mjBizAppsOrdersPayment_[]; // Link to mjBizAppsOrdersPayments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Intents
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentIntentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PaymentProviderID?: string;

    @Field({ nullable: true })
    ProviderIntentID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    OrderID: string | null;

    @Field({ nullable: true })
    CustomerOrganizationID: string | null;

    @Field({ nullable: true })
    ProviderEventID: string | null;

    @Field({ nullable: true })
    LastEventAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Intents
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentIntentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PaymentProviderID?: string;

    @Field({ nullable: true })
    ProviderIntentID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    OrderID?: string | null;

    @Field({ nullable: true })
    CustomerOrganizationID?: string | null;

    @Field({ nullable: true })
    ProviderEventID?: string | null;

    @Field({ nullable: true })
    LastEventAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Intents
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentIntentViewResult {
    @Field(() => [mjBizAppsOrdersPaymentIntent_])
    Results: mjBizAppsOrdersPaymentIntent_[];

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

@Resolver(mjBizAppsOrdersPaymentIntent_)
export class mjBizAppsOrdersPaymentIntentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentIntentViewResult)
    async RunmjBizAppsOrdersPaymentIntentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentIntentViewResult)
    async RunmjBizAppsOrdersPaymentIntentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentIntentViewResult)
    async RunmjBizAppsOrdersPaymentIntentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Intents';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentIntent_, { nullable: true })
    async mjBizAppsOrdersPaymentIntent(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentIntent_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Intents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentIntents')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Intents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Intents', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPayment_])
    async mjBizAppsOrdersPayments_PaymentIntentIDArray(@Root() mjbizappsorderspaymentintent_: mjBizAppsOrdersPaymentIntent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPayments')} WHERE ${provider.QuoteIdentifier('PaymentIntentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentintent_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentIntent_)
    async CreatemjBizAppsOrdersPaymentIntent(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentIntentInput) input: CreatemjBizAppsOrdersPaymentIntentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Intents', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentIntent_)
    async UpdatemjBizAppsOrdersPaymentIntent(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentIntentInput) input: UpdatemjBizAppsOrdersPaymentIntentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Intents', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentIntent_)
    async DeletemjBizAppsOrdersPaymentIntent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Intents', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Payment Lines
//****************************************************************************
@ObjectType({ description: `Cash application junction (BO-D16/D45): how much of a payment settles which order (optionally which line). Negative Amount applies a credit memo.` })
export class mjBizAppsOrdersPaymentLine_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PaymentID: string;
        
    @Field() 
    @MaxLength(36)
    OrderID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrderLineID?: string;
        
    @Field(() => Float, {description: `Amount of the payment applied to this order (<> 0; negative when applying a credit memo).`}) 
    Amount: number;
        
    @Field({description: `UTC timestamp when this application was made.`}) 
    AllocatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AllocatedByUserID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    AllocatedByUser?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Lines
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentLineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PaymentID?: string;

    @Field({ nullable: true })
    OrderID?: string;

    @Field({ nullable: true })
    OrderLineID: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    AllocatedAt?: Date;

    @Field({ nullable: true })
    AllocatedByUserID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Lines
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentLineInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PaymentID?: string;

    @Field({ nullable: true })
    OrderID?: string;

    @Field({ nullable: true })
    OrderLineID?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    AllocatedAt?: Date;

    @Field({ nullable: true })
    AllocatedByUserID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Lines
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentLineViewResult {
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    Results: mjBizAppsOrdersPaymentLine_[];

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

@Resolver(mjBizAppsOrdersPaymentLine_)
export class mjBizAppsOrdersPaymentLineResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentLineViewResult)
    async RunmjBizAppsOrdersPaymentLineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentLineViewResult)
    async RunmjBizAppsOrdersPaymentLineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentLineViewResult)
    async RunmjBizAppsOrdersPaymentLineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Lines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentLine_, { nullable: true })
    async mjBizAppsOrdersPaymentLine(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentLine_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentLines')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Lines', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentLine_)
    async CreatemjBizAppsOrdersPaymentLine(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentLineInput) input: CreatemjBizAppsOrdersPaymentLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Lines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentLine_)
    async UpdatemjBizAppsOrdersPaymentLine(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentLineInput) input: UpdatemjBizAppsOrdersPaymentLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Lines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentLine_)
    async DeletemjBizAppsOrdersPaymentLine(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Lines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Payment Providers
//****************************************************************************
@ObjectType({ description: `A configured payment-processing account (Stripe account, or the built-in Manual provider) owned by one company.` })
export class mjBizAppsOrdersPaymentProvider_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Stripe | Manual. Widens as additional processors land.`}) 
    @MaxLength(40)
    ProviderType: string;
        
    @Field() 
    @MaxLength(36)
    CompanyID: string;
        
    @Field({description: `Display name of this provider account.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true, description: `MJ Credentials engine key referencing the provider credentials. NEVER a secret value at rest.`}) 
    @MaxLength(200)
    CredentialsRef?: string;
        
    @Field(() => Boolean, {description: `Whether this account points at the provider's live environment (vs test/sandbox).`}) 
    IsLiveMode: boolean;
        
    @Field(() => Boolean, {description: `Whether this provider account is active.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field(() => [mjBizAppsOrdersPayment_])
    mjBizAppsOrdersPayments_PaymentProviderIDArray: mjBizAppsOrdersPayment_[]; // Link to mjBizAppsOrdersPayments
    
    @Field(() => [mjBizAppsOrdersCustomerPaymentMethod_])
    mjBizAppsOrdersCustomerPaymentMethods_PaymentProviderIDArray: mjBizAppsOrdersCustomerPaymentMethod_[]; // Link to mjBizAppsOrdersCustomerPaymentMethods
    
    @Field(() => [mjBizAppsOrdersPaymentIntent_])
    mjBizAppsOrdersPaymentIntents_PaymentProviderIDArray: mjBizAppsOrdersPaymentIntent_[]; // Link to mjBizAppsOrdersPaymentIntents
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Providers
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentProviderInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProviderType?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    CredentialsRef: string | null;

    @Field(() => Boolean, { nullable: true })
    IsLiveMode?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Providers
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentProviderInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProviderType?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    CredentialsRef?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsLiveMode?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Providers
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentProviderViewResult {
    @Field(() => [mjBizAppsOrdersPaymentProvider_])
    Results: mjBizAppsOrdersPaymentProvider_[];

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

@Resolver(mjBizAppsOrdersPaymentProvider_)
export class mjBizAppsOrdersPaymentProviderResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentProviderViewResult)
    async RunmjBizAppsOrdersPaymentProviderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentProviderViewResult)
    async RunmjBizAppsOrdersPaymentProviderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentProviderViewResult)
    async RunmjBizAppsOrdersPaymentProviderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Providers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentProvider_, { nullable: true })
    async mjBizAppsOrdersPaymentProvider(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentProvider_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Providers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentProviders')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Providers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Providers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPayment_])
    async mjBizAppsOrdersPayments_PaymentProviderIDArray(@Root() mjbizappsorderspaymentprovider_: mjBizAppsOrdersPaymentProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPayments')} WHERE ${provider.QuoteIdentifier('PaymentProviderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovider_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersCustomerPaymentMethod_])
    async mjBizAppsOrdersCustomerPaymentMethods_PaymentProviderIDArray(@Root() mjbizappsorderspaymentprovider_: mjBizAppsOrdersPaymentProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Customer Payment Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwCustomerPaymentMethods')} WHERE ${provider.QuoteIdentifier('PaymentProviderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Customer Payment Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovider_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Customer Payment Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentIntent_])
    async mjBizAppsOrdersPaymentIntents_PaymentProviderIDArray(@Root() mjbizappsorderspaymentprovider_: mjBizAppsOrdersPaymentProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Intents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentIntents')} WHERE ${provider.QuoteIdentifier('PaymentProviderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Intents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovider_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Intents', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentProvider_)
    async CreatemjBizAppsOrdersPaymentProvider(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentProviderInput) input: CreatemjBizAppsOrdersPaymentProviderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Providers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentProvider_)
    async UpdatemjBizAppsOrdersPaymentProvider(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentProviderInput) input: UpdatemjBizAppsOrdersPaymentProviderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Providers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentProvider_)
    async DeletemjBizAppsOrdersPaymentProvider(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Providers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Payment Sequences
//****************************************************************************
@ObjectType({ description: `Global singleton counter (ID=1) minting gap-conscious PAY-{seq} payment numbers. Consumed only by the entity server.` })
export class mjBizAppsOrdersPaymentSequence_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {description: `The next payment sequence number to assign.`}) 
    NextSequenceNumber: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Sequences
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentSequenceInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    NextSequenceNumber?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Sequences
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentSequenceInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    NextSequenceNumber?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Sequences
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentSequenceViewResult {
    @Field(() => [mjBizAppsOrdersPaymentSequence_])
    Results: mjBizAppsOrdersPaymentSequence_[];

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

@Resolver(mjBizAppsOrdersPaymentSequence_)
export class mjBizAppsOrdersPaymentSequenceResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentSequenceViewResult)
    async RunmjBizAppsOrdersPaymentSequenceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentSequenceViewResult)
    async RunmjBizAppsOrdersPaymentSequenceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentSequenceViewResult)
    async RunmjBizAppsOrdersPaymentSequenceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Sequences';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentSequence_, { nullable: true })
    async mjBizAppsOrdersPaymentSequence(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentSequence_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Sequences', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentSequences')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Sequences', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Sequences', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentSequence_)
    async CreatemjBizAppsOrdersPaymentSequence(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentSequenceInput) input: CreatemjBizAppsOrdersPaymentSequenceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Sequences', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentSequence_)
    async UpdatemjBizAppsOrdersPaymentSequence(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentSequenceInput) input: UpdatemjBizAppsOrdersPaymentSequenceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Sequences', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentSequence_)
    async DeletemjBizAppsOrdersPaymentSequence(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Sequences', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Payment Terms Types
//****************************************************************************
@ObjectType({ description: `Payment terms lookup (Net 30, Due on Receipt, ...). Owned by Orders; NetDays derives Order.DueDate from the posting date. Seed rows via metadata sync.` })
export class mjBizAppsOrdersPaymentTermsType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Stable machine code (Net30, DueOnReceipt, Prepaid, ...). Unique.`}) 
    @MaxLength(40)
    Code: string;
        
    @Field({description: `Display name of the payment terms.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field(() => Int, {description: `Days from the posting date to DueDate (0 = due on receipt).`}) 
    NetDays: number;
        
    @Field({nullable: true, description: `Optional description of the terms.`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether these terms are active and selectable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersOrder_])
    mjBizAppsOrdersOrders_PaymentTermsTypeIDArray: mjBizAppsOrdersOrder_[]; // Link to mjBizAppsOrdersOrders
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Terms Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentTermsTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    NetDays?: number;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Terms Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentTermsTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    NetDays?: number;

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
// RESOLVER for MJ_BizApps_Orders: Payment Terms Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentTermsTypeViewResult {
    @Field(() => [mjBizAppsOrdersPaymentTermsType_])
    Results: mjBizAppsOrdersPaymentTermsType_[];

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

@Resolver(mjBizAppsOrdersPaymentTermsType_)
export class mjBizAppsOrdersPaymentTermsTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentTermsTypeViewResult)
    async RunmjBizAppsOrdersPaymentTermsTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentTermsTypeViewResult)
    async RunmjBizAppsOrdersPaymentTermsTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentTermsTypeViewResult)
    async RunmjBizAppsOrdersPaymentTermsTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Terms Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentTermsType_, { nullable: true })
    async mjBizAppsOrdersPaymentTermsType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentTermsType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Terms Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentTermsTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Terms Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Terms Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrder_])
    async mjBizAppsOrdersOrders_PaymentTermsTypeIDArray(@Root() mjbizappsorderspaymenttermstype_: mjBizAppsOrdersPaymentTermsType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrders')} WHERE ${provider.QuoteIdentifier('PaymentTermsTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymenttermstype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Orders', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentTermsType_)
    async CreatemjBizAppsOrdersPaymentTermsType(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentTermsTypeInput) input: CreatemjBizAppsOrdersPaymentTermsTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Terms Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentTermsType_)
    async UpdatemjBizAppsOrdersPaymentTermsType(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentTermsTypeInput) input: UpdatemjBizAppsOrdersPaymentTermsTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Terms Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentTermsType_)
    async DeletemjBizAppsOrdersPaymentTermsType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Terms Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Payments
//****************************************************************************
@ObjectType({ description: `A money movement: a customer receipt or a reversal (refund/chargeback/bank return). Booked to accounting at capture; applied to orders via PaymentLine.` })
export class mjBizAppsOrdersPayment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable payment identifier (PAY-{seq}). Unique.`}) 
    @MaxLength(40)
    PaymentNumber: string;
        
    @Field() 
    @MaxLength(36)
    ReceivingCompanyID: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to __mj_BizAppsCommon.Organization — the payer. NULL only for anonymous/e-commerce edge cases.`}) 
    @MaxLength(36)
    CustomerOrganizationID?: string;
        
    @Field({description: `Date the money moved (bank date, not entry date).`}) 
    PaymentDate: Date;
        
    @Field({description: `CreditCard | ACH | Wire | Check | Cash | InternalTransfer | Refund | Chargeback | BankReturn. Reversal methods carry negative Amount.`}) 
    @MaxLength(20)
    Method: string;
        
    @Field(() => Float, {description: `Gross amount received (negative for reversal methods).`}) 
    Amount: number;
        
    @Field(() => Float, {description: `Processor fee withheld from this payment.`}) 
    ProcessingFeeAmount: number;
        
    @Field(() => Float, {nullable: true, description: `Net cash = Amount - ProcessingFeeAmount (engine-computed, BO-D47).`}) 
    NetAmount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PaymentProviderID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PaymentIntentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PaymentMethodID?: string;
        
    @Field({nullable: true, description: `Provider-side charge identifier (e.g. Stripe ch_...).`}) 
    @MaxLength(100)
    ProviderChargeID?: string;
        
    @Field({nullable: true, description: `Provider-side refund identifier when this payment is a provider refund.`}) 
    @MaxLength(100)
    ProviderRefundID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ReversesPaymentID?: string;
        
    @Field({nullable: true, description: `Reason this payment reverses another (required by validation when ReversesPaymentID is set).`}) 
    ReversalReason?: string;
        
    @Field({description: `Pending | Captured | Failed | Refunded | Disputed. Financial fields freeze at Captured (DB trigger); corrections via reversal payments.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).`}) 
    @MaxLength(36)
    JournalEntryID?: string;
        
    @Field({nullable: true, description: `Customer-facing description / memo.`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Internal notes.`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    ReceivingCompany: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentProvider?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootReversesPaymentID?: string;
        
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    mjBizAppsOrdersPaymentLines_PaymentIDArray: mjBizAppsOrdersPaymentLine_[]; // Link to mjBizAppsOrdersPaymentLines
    
    @Field(() => [mjBizAppsOrdersPayment_])
    mjBizAppsOrdersPayments_ReversesPaymentIDArray: mjBizAppsOrdersPayment_[]; // Link to mjBizAppsOrdersPayments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payments
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PaymentNumber?: string;

    @Field({ nullable: true })
    ReceivingCompanyID?: string;

    @Field({ nullable: true })
    CustomerOrganizationID: string | null;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field({ nullable: true })
    Method?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    ProcessingFeeAmount?: number;

    @Field(() => Float, { nullable: true })
    NetAmount: number | null;

    @Field({ nullable: true })
    PaymentProviderID: string | null;

    @Field({ nullable: true })
    PaymentIntentID: string | null;

    @Field({ nullable: true })
    PaymentMethodID: string | null;

    @Field({ nullable: true })
    ProviderChargeID: string | null;

    @Field({ nullable: true })
    ProviderRefundID: string | null;

    @Field({ nullable: true })
    ReversesPaymentID: string | null;

    @Field({ nullable: true })
    ReversalReason: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    JournalEntryID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PaymentNumber?: string;

    @Field({ nullable: true })
    ReceivingCompanyID?: string;

    @Field({ nullable: true })
    CustomerOrganizationID?: string | null;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field({ nullable: true })
    Method?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    ProcessingFeeAmount?: number;

    @Field(() => Float, { nullable: true })
    NetAmount?: number | null;

    @Field({ nullable: true })
    PaymentProviderID?: string | null;

    @Field({ nullable: true })
    PaymentIntentID?: string | null;

    @Field({ nullable: true })
    PaymentMethodID?: string | null;

    @Field({ nullable: true })
    ProviderChargeID?: string | null;

    @Field({ nullable: true })
    ProviderRefundID?: string | null;

    @Field({ nullable: true })
    ReversesPaymentID?: string | null;

    @Field({ nullable: true })
    ReversalReason?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    JournalEntryID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentViewResult {
    @Field(() => [mjBizAppsOrdersPayment_])
    Results: mjBizAppsOrdersPayment_[];

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

@Resolver(mjBizAppsOrdersPayment_)
export class mjBizAppsOrdersPaymentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentViewResult)
    async RunmjBizAppsOrdersPaymentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentViewResult)
    async RunmjBizAppsOrdersPaymentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentViewResult)
    async RunmjBizAppsOrdersPaymentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPayment_, { nullable: true })
    async mjBizAppsOrdersPayment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPayment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPayments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentLine_])
    async mjBizAppsOrdersPaymentLines_PaymentIDArray(@Root() mjbizappsorderspayment_: mjBizAppsOrdersPayment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentLines')} WHERE ${provider.QuoteIdentifier('PaymentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspayment_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPayment_])
    async mjBizAppsOrdersPayments_ReversesPaymentIDArray(@Root() mjbizappsorderspayment_: mjBizAppsOrdersPayment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPayments')} WHERE ${provider.QuoteIdentifier('ReversesPaymentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspayment_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPayment_)
    async CreatemjBizAppsOrdersPayment(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentInput) input: CreatemjBizAppsOrdersPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPayment_)
    async UpdatemjBizAppsOrdersPayment(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentInput) input: UpdatemjBizAppsOrdersPaymentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPayment_)
    async DeletemjBizAppsOrdersPayment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payments', key, options, provider, userPayload, pubSub);
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
        
    @Field(() => Boolean, {description: `When 1, orders containing products of this type hold at Posted until a fulfiller marks every such line Fulfilled; when no line requires fulfillment the order auto-advances to Fulfilled.`}) 
    RequiresFulfillment: boolean;
        
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
    RequiresFulfillment?: boolean;

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
    RequiresFulfillment?: boolean;

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
    mjBizAppsOrdersOrderLines_SourceBundleProductIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
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
    async mjBizAppsOrdersOrderLines_SourceBundleProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('SourceBundleProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
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
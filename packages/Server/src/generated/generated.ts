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


import { mjBizAppsOrdersChargeTypeEntity, mjBizAppsOrdersCustomerPaymentMethodEntity, mjBizAppsOrdersEntitlementGrantEntity, mjBizAppsOrdersEventOrderLineEntity, mjBizAppsOrdersEventProductEntity, mjBizAppsOrdersOrderAdjustmentAllocationEntity, mjBizAppsOrdersOrderAdjustmentEntity, mjBizAppsOrdersOrderChargeAllocationEntity, mjBizAppsOrdersOrderChargeEntity, mjBizAppsOrdersOrderCompanyPolicyEntity, mjBizAppsOrdersOrderHeaderEntity, mjBizAppsOrdersOrderLineDimensionEntity, mjBizAppsOrdersOrderLinePriceComponentEntity, mjBizAppsOrdersOrderLineEntity, mjBizAppsOrdersOrderSequenceEntity, mjBizAppsOrdersPaymentDetailEntity, mjBizAppsOrdersPaymentHeaderEntity, mjBizAppsOrdersPaymentIntentEntity, mjBizAppsOrdersPaymentLineEntity, mjBizAppsOrdersPaymentProviderTypeEntity, mjBizAppsOrdersPaymentProviderEntity, mjBizAppsOrdersPaymentSequenceEntity, mjBizAppsOrdersPaymentTermsTypeEntity, mjBizAppsOrdersPaymentTypeEntity, mjBizAppsOrdersPriceListAssignmentEntity, mjBizAppsOrdersPriceListEntity, mjBizAppsOrdersPriceTierEntity, mjBizAppsOrdersProductBundleItemEntity, mjBizAppsOrdersProductCategoryEntity, mjBizAppsOrdersProductEntitlementEntity, mjBizAppsOrdersProductPerformanceObligationEntity, mjBizAppsOrdersProductPriceEntity, mjBizAppsOrdersProductTypeEntity, mjBizAppsOrdersProductEntity, mjBizAppsOrdersPromotionCodeEntity, mjBizAppsOrdersPromotionTargetEntity, mjBizAppsOrdersPromotionTypeEntity, mjBizAppsOrdersPromotionEntity, mjBizAppsOrdersRevRecScheduleLineEntity, mjBizAppsOrdersRevenueRecognitionScheduleEntity, mjBizAppsOrdersRevenueRecognitionTypeEntity, mjBizAppsOrdersSalesAuthorityEntity, mjBizAppsOrdersSalesRuleEntity, mjBizAppsOrdersStoredValueAccountEntity, mjBizAppsOrdersStoredValueTransactionEntity, mjBizAppsOrdersSubscriptionEventEntity, mjBizAppsOrdersSubscriptionSequenceEntity, mjBizAppsOrdersSubscriptionTermEntity, mjBizAppsOrdersSubscriptionTypeEntity, mjBizAppsOrdersSubscriptionEntity } from '@mj-biz-apps/orders-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Charge Types
//****************************************************************************
@ObjectType({ description: `A kind of charge and how it computes. Shipping, handling, surcharges AND TAX are all charges - modelling tax this way means multi-layer tax (state, county, city) is several charges rather than a special case, so ordering, allocation, GL treatment and overrides are written once and apply to all of them.` })
export class mjBizAppsOrdersChargeType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({description: `Shipping | Handling | Tax | Surcharge | Fee.`}) 
    @MaxLength(20)
    Category: string;
        
    @Field({description: `What the charge computes on: LineNet (the discounted line), LineNetPlusCharges (after earlier charges in sequence), OrderNet, or Flat. This is the field that makes tax-on-shipping work, which is jurisdiction-dependent and therefore configuration rather than code.`}) 
    @MaxLength(30)
    Basis: string;
        
    @Field(() => Int, {description: `Application order. Charges compute in this order and later ones may build on earlier ones via Basis.`}) 
    Sequence: number;
        
    @Field(() => Boolean, {description: `Whether a human may override a computed charge of this type.`}) 
    AllowsOverride: boolean;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersOrderCharge_])
    mjBizAppsOrdersOrderCharges_ChargeTypeIDArray: mjBizAppsOrdersOrderCharge_[]; // Link to mjBizAppsOrdersOrderCharges
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Charge Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersChargeTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Basis?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    AllowsOverride?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Charge Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersChargeTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Basis?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    AllowsOverride?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Charge Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersChargeTypeViewResult {
    @Field(() => [mjBizAppsOrdersChargeType_])
    Results: mjBizAppsOrdersChargeType_[];

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

@Resolver(mjBizAppsOrdersChargeType_)
export class mjBizAppsOrdersChargeTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersChargeTypeViewResult)
    async RunmjBizAppsOrdersChargeTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersChargeTypeViewResult)
    async RunmjBizAppsOrdersChargeTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersChargeTypeViewResult)
    async RunmjBizAppsOrdersChargeTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Charge Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersChargeType_, { nullable: true })
    async mjBizAppsOrdersChargeType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersChargeType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Charge Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwChargeTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Charge Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Charge Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderCharge_])
    async mjBizAppsOrdersOrderCharges_ChargeTypeIDArray(@Root() mjbizappsorderschargetype_: mjBizAppsOrdersChargeType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Charges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderCharges')} WHERE ${provider.QuoteIdentifier('ChargeTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Charges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderschargetype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Charges', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersChargeType_)
    async CreatemjBizAppsOrdersChargeType(
        @Arg('input', () => CreatemjBizAppsOrdersChargeTypeInput) input: CreatemjBizAppsOrdersChargeTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Charge Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersChargeType_)
    async UpdatemjBizAppsOrdersChargeType(
        @Arg('input', () => UpdatemjBizAppsOrdersChargeTypeInput) input: UpdatemjBizAppsOrdersChargeTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Charge Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersChargeType_)
    async DeletemjBizAppsOrdersChargeType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Charge Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Customer Payment Methods
//****************************************************************************
@ObjectType({ description: `A stored payment method token for a customer (BO-D46). Provider token references only — never card data.` })
export class mjBizAppsOrdersCustomerPaymentMethod_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OwnerPersonID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the organization this saved method belongs to (D65). Nullable; CK_CustomerPaymentMethod_Owner requires a person or an organization.`}) 
    @MaxLength(36)
    OwnerOrganizationID?: string;
        
    @Field() 
    @MaxLength(36)
    PaymentDetailID: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Nickname?: string;
        
    @Field(() => Boolean, {description: `Whether this is the customer's default method for charge-on-file.`}) 
    IsDefault: boolean;
        
    @Field(() => Boolean, {description: `Whether this method is active/usable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    OwnerPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    OwnerOrganization?: string;
        
    @Field(() => [mjBizAppsOrdersPaymentDetail_])
    mjBizAppsOrdersPaymentDetails_SourceCustomerPaymentMethodIDArray: mjBizAppsOrdersPaymentDetail_[]; // Link to mjBizAppsOrdersPaymentDetails
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Customer Payment Methods
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersCustomerPaymentMethodInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OwnerPersonID: string | null;

    @Field({ nullable: true })
    OwnerOrganizationID: string | null;

    @Field({ nullable: true })
    PaymentDetailID?: string;

    @Field({ nullable: true })
    Nickname: string | null;

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
    OwnerPersonID?: string | null;

    @Field({ nullable: true })
    OwnerOrganizationID?: string | null;

    @Field({ nullable: true })
    PaymentDetailID?: string;

    @Field({ nullable: true })
    Nickname?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentDetail_])
    async mjBizAppsOrdersPaymentDetails_SourceCustomerPaymentMethodIDArray(@Root() mjbizappsorderscustomerpaymentmethod_: mjBizAppsOrdersCustomerPaymentMethod_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentDetails')} WHERE ${provider.QuoteIdentifier('SourceCustomerPaymentMethodID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderscustomerpaymentmethod_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Details', rows, this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for MJ_BizApps_Orders: Entitlement Grants
//****************************************************************************
@ObjectType({ description: `A granted entitlement instance created at Post / subscription activation (BO-D39), carrying the beneficiary (defaults to the buyer; a line may designate another). Downstream apps read grants to provision access.` })
export class mjBizAppsOrdersEntitlementGrant_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ProductEntitlementID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrderLineID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SubscriptionID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Person — the benefiting person (attendee, recipient, honoree).`}) 
    @MaxLength(36)
    BeneficiaryPersonID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the benefiting organization.`}) 
    @MaxLength(36)
    BeneficiaryOrganizationID?: string;
        
    @Field(() => Float, {nullable: true, description: `Granted quantity (defaults from the entitlement definition).`}) 
    Quantity?: number;
        
    @Field({nullable: true, description: `Grant validity start.`}) 
    ValidFrom?: Date;
        
    @Field({nullable: true, description: `Grant validity end.`}) 
    ValidTo?: Date;
        
    @Field({description: `Active | Suspended | Revoked | Expired.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `UTC timestamp downstream provisioning completed (NULL until provisioned).`}) 
    ProvisionedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ProductEntitlement?: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    BeneficiaryPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    BeneficiaryOrganization?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Entitlement Grants
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersEntitlementGrantInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProductEntitlementID?: string;

    @Field({ nullable: true })
    OrderLineID: string | null;

    @Field({ nullable: true })
    SubscriptionID: string | null;

    @Field({ nullable: true })
    BeneficiaryPersonID: string | null;

    @Field({ nullable: true })
    BeneficiaryOrganizationID: string | null;

    @Field(() => Float, { nullable: true })
    Quantity: number | null;

    @Field({ nullable: true })
    ValidFrom: Date | null;

    @Field({ nullable: true })
    ValidTo: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ProvisionedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Entitlement Grants
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersEntitlementGrantInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProductEntitlementID?: string;

    @Field({ nullable: true })
    OrderLineID?: string | null;

    @Field({ nullable: true })
    SubscriptionID?: string | null;

    @Field({ nullable: true })
    BeneficiaryPersonID?: string | null;

    @Field({ nullable: true })
    BeneficiaryOrganizationID?: string | null;

    @Field(() => Float, { nullable: true })
    Quantity?: number | null;

    @Field({ nullable: true })
    ValidFrom?: Date | null;

    @Field({ nullable: true })
    ValidTo?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ProvisionedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Entitlement Grants
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersEntitlementGrantViewResult {
    @Field(() => [mjBizAppsOrdersEntitlementGrant_])
    Results: mjBizAppsOrdersEntitlementGrant_[];

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

@Resolver(mjBizAppsOrdersEntitlementGrant_)
export class mjBizAppsOrdersEntitlementGrantResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersEntitlementGrantViewResult)
    async RunmjBizAppsOrdersEntitlementGrantViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersEntitlementGrantViewResult)
    async RunmjBizAppsOrdersEntitlementGrantViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersEntitlementGrantViewResult)
    async RunmjBizAppsOrdersEntitlementGrantDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Entitlement Grants';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersEntitlementGrant_, { nullable: true })
    async mjBizAppsOrdersEntitlementGrant(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersEntitlementGrant_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Entitlement Grants', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEntitlementGrants')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Entitlement Grants', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Entitlement Grants', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersEntitlementGrant_)
    async CreatemjBizAppsOrdersEntitlementGrant(
        @Arg('input', () => CreatemjBizAppsOrdersEntitlementGrantInput) input: CreatemjBizAppsOrdersEntitlementGrantInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Entitlement Grants', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersEntitlementGrant_)
    async UpdatemjBizAppsOrdersEntitlementGrant(
        @Arg('input', () => UpdatemjBizAppsOrdersEntitlementGrantInput) input: UpdatemjBizAppsOrdersEntitlementGrantInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Entitlement Grants', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersEntitlementGrant_)
    async DeletemjBizAppsOrdersEntitlementGrant(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Entitlement Grants', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Event Order Lines
//****************************************************************************
@ObjectType({ description: `IsA Disjoint child of OrderLine (same UUID): per-line attendee detail; the attendee is typically the EntitlementGrant beneficiary (BO-D39).` })
export class mjBizAppsOrdersEventOrderLine_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: `Attendee full name.`}) 
    @MaxLength(300)
    AttendeeName?: string;
        
    @Field({nullable: true, description: `Attendee email.`}) 
    @MaxLength(255)
    AttendeeEmail?: string;
        
    @Field({nullable: true, description: `UTC timestamp the attendee checked in.`}) 
    CheckInAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(36)
    OrderHeaderID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field() 
    @MaxLength(36)
    CompanyID: string;
        
    @Field(() => Int) 
    LineNumber: number;
        
    @Field(() => Float) 
    Quantity: number;
        
    @Field(() => Float) 
    UnitPrice: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ProductPriceID?: string;
        
    @Field(() => Float) 
    DiscountPct: number;
        
    @Field(() => Float, {nullable: true}) 
    LineTotalNet?: number;
        
    @Field(() => Float) 
    LineTax: number;
        
    @Field(() => Float, {nullable: true}) 
    LineTotalGross?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToAddressID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToOrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RenewsSubscriptionID?: string;
        
    @Field({nullable: true}) 
    ServicePeriodStart?: Date;
        
    @Field({nullable: true}) 
    ServicePeriodEnd?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    FulfillmentStatus?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ReversesOrderLineID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SourceBundleProductID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SubscriptionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RevenueRecognitionScheduleID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    JournalEntryID?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Event Order Lines
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersEventOrderLineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    AttendeeName: string | null;

    @Field({ nullable: true })
    AttendeeEmail: string | null;

    @Field({ nullable: true })
    CheckInAt: Date | null;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field(() => Int, { nullable: true })
    LineNumber?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    ProductPriceID: string | null;

    @Field(() => Float, { nullable: true })
    DiscountPct?: number;

    @Field(() => Float, { nullable: true })
    LineTotalNet: number | null;

    @Field(() => Float, { nullable: true })
    LineTax?: number;

    @Field(() => Float, { nullable: true })
    LineTotalGross: number | null;

    @Field({ nullable: true })
    ShipToAddressID: string | null;

    @Field({ nullable: true })
    ShipToOrganizationID: string | null;

    @Field({ nullable: true })
    ShipToPersonID: string | null;

    @Field({ nullable: true })
    RenewsSubscriptionID: string | null;

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
    SubscriptionID: string | null;

    @Field({ nullable: true })
    RevenueRecognitionScheduleID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    JournalEntryID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Event Order Lines
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersEventOrderLineInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    AttendeeName?: string | null;

    @Field({ nullable: true })
    AttendeeEmail?: string | null;

    @Field({ nullable: true })
    CheckInAt?: Date | null;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field(() => Int, { nullable: true })
    LineNumber?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    ProductPriceID?: string | null;

    @Field(() => Float, { nullable: true })
    DiscountPct?: number;

    @Field(() => Float, { nullable: true })
    LineTotalNet?: number | null;

    @Field(() => Float, { nullable: true })
    LineTax?: number;

    @Field(() => Float, { nullable: true })
    LineTotalGross?: number | null;

    @Field({ nullable: true })
    ShipToAddressID?: string | null;

    @Field({ nullable: true })
    ShipToOrganizationID?: string | null;

    @Field({ nullable: true })
    ShipToPersonID?: string | null;

    @Field({ nullable: true })
    RenewsSubscriptionID?: string | null;

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
    SubscriptionID?: string | null;

    @Field({ nullable: true })
    RevenueRecognitionScheduleID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    JournalEntryID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Event Order Lines
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersEventOrderLineViewResult {
    @Field(() => [mjBizAppsOrdersEventOrderLine_])
    Results: mjBizAppsOrdersEventOrderLine_[];

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

@Resolver(mjBizAppsOrdersEventOrderLine_)
export class mjBizAppsOrdersEventOrderLineResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersEventOrderLineViewResult)
    async RunmjBizAppsOrdersEventOrderLineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersEventOrderLineViewResult)
    async RunmjBizAppsOrdersEventOrderLineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersEventOrderLineViewResult)
    async RunmjBizAppsOrdersEventOrderLineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Event Order Lines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersEventOrderLine_, { nullable: true })
    async mjBizAppsOrdersEventOrderLine(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersEventOrderLine_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Event Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEventOrderLines')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Event Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Event Order Lines', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersEventOrderLine_)
    async CreatemjBizAppsOrdersEventOrderLine(
        @Arg('input', () => CreatemjBizAppsOrdersEventOrderLineInput) input: CreatemjBizAppsOrdersEventOrderLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Event Order Lines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersEventOrderLine_)
    async UpdatemjBizAppsOrdersEventOrderLine(
        @Arg('input', () => UpdatemjBizAppsOrdersEventOrderLineInput) input: UpdatemjBizAppsOrdersEventOrderLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Event Order Lines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersEventOrderLine_)
    async DeletemjBizAppsOrdersEventOrderLine(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Event Order Lines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Event Products
//****************************************************************************
@ObjectType({ description: `IsA Disjoint child of Product (same UUID): event-specific catalog fields (BO-D37). A product is at most one subtype.` })
export class mjBizAppsOrdersEventProduct_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `UTC start of the event (also the SingleDate recognition date for Deferred event products).`}) 
    EventStartsAt: Date;
        
    @Field({nullable: true, description: `UTC end of the event.`}) 
    EventEndsAt?: Date;
        
    @Field({nullable: true, description: `Venue display name.`}) 
    @MaxLength(300)
    VenueName?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Address — the venue address.`}) 
    @MaxLength(36)
    VenueAddressID?: string;
        
    @Field(() => Int, {nullable: true, description: `Maximum attendee count. NULL = uncapped.`}) 
    Capacity?: number;
        
    @Field(() => Boolean, {description: `Whether order lines for this event require attendee info (EventOrderLine).`}) 
    RequiresAttendeeInfo: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(80)
    SKU?: string;
        
    @Field() 
    @MaxLength(36)
    ProductTypeID: string;
        
    @Field() 
    @MaxLength(36)
    ProductCategoryID: string;
        
    @Field() 
    @MaxLength(36)
    CompanyID: string;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SuccessorProductID?: string;
        
    @Field({nullable: true}) 
    AvailableFrom?: Date;
        
    @Field({nullable: true}) 
    AvailableTo?: Date;
        
    @Field() 
    @MaxLength(36)
    RevenueRecognitionTypeID: string;
        
    @Field(() => Float, {nullable: true}) 
    StandaloneSellingPrice?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SubscriptionTypeID?: string;
        
    @Field(() => Boolean) 
    IsTaxable: boolean;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    TaxCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    VenueAddress?: string;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Event Products
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersEventProductInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EventStartsAt?: Date;

    @Field({ nullable: true })
    EventEndsAt: Date | null;

    @Field({ nullable: true })
    VenueName: string | null;

    @Field({ nullable: true })
    VenueAddressID: string | null;

    @Field(() => Int, { nullable: true })
    Capacity: number | null;

    @Field(() => Boolean, { nullable: true })
    RequiresAttendeeInfo?: boolean;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    SKU: string | null;

    @Field({ nullable: true })
    ProductTypeID?: string;

    @Field({ nullable: true })
    ProductCategoryID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SuccessorProductID: string | null;

    @Field({ nullable: true })
    AvailableFrom: Date | null;

    @Field({ nullable: true })
    AvailableTo: Date | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field(() => Float, { nullable: true })
    StandaloneSellingPrice: number | null;

    @Field({ nullable: true })
    SubscriptionTypeID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsTaxable?: boolean;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TaxCategory: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Event Products
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersEventProductInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EventStartsAt?: Date;

    @Field({ nullable: true })
    EventEndsAt?: Date | null;

    @Field({ nullable: true })
    VenueName?: string | null;

    @Field({ nullable: true })
    VenueAddressID?: string | null;

    @Field(() => Int, { nullable: true })
    Capacity?: number | null;

    @Field(() => Boolean, { nullable: true })
    RequiresAttendeeInfo?: boolean;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    SKU?: string | null;

    @Field({ nullable: true })
    ProductTypeID?: string;

    @Field({ nullable: true })
    ProductCategoryID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SuccessorProductID?: string | null;

    @Field({ nullable: true })
    AvailableFrom?: Date | null;

    @Field({ nullable: true })
    AvailableTo?: Date | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field(() => Float, { nullable: true })
    StandaloneSellingPrice?: number | null;

    @Field({ nullable: true })
    SubscriptionTypeID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsTaxable?: boolean;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TaxCategory?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Event Products
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersEventProductViewResult {
    @Field(() => [mjBizAppsOrdersEventProduct_])
    Results: mjBizAppsOrdersEventProduct_[];

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

@Resolver(mjBizAppsOrdersEventProduct_)
export class mjBizAppsOrdersEventProductResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersEventProductViewResult)
    async RunmjBizAppsOrdersEventProductViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersEventProductViewResult)
    async RunmjBizAppsOrdersEventProductViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersEventProductViewResult)
    async RunmjBizAppsOrdersEventProductDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Event Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersEventProduct_, { nullable: true })
    async mjBizAppsOrdersEventProduct(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersEventProduct_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Event Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEventProducts')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Event Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Event Products', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersEventProduct_)
    async CreatemjBizAppsOrdersEventProduct(
        @Arg('input', () => CreatemjBizAppsOrdersEventProductInput) input: CreatemjBizAppsOrdersEventProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Event Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersEventProduct_)
    async UpdatemjBizAppsOrdersEventProduct(
        @Arg('input', () => UpdatemjBizAppsOrdersEventProductInput) input: UpdatemjBizAppsOrdersEventProductInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Event Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersEventProduct_)
    async DeletemjBizAppsOrdersEventProduct(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Event Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Adjustment Allocations
//****************************************************************************
@ObjectType({ description: `Which lines an adjustment reduces, and by how much. Mandatory rather than optional: tax and GL are per line, and on a multi-company order this split decides WHOSE revenue is reduced. A line-level adjustment gets one row; an order-level one gets several, pro-rata by line value with the largest line absorbing the rounding remainder.` })
export class mjBizAppsOrdersOrderAdjustmentAllocation_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderAdjustmentID: string;
        
    @Field() 
    @MaxLength(36)
    OrderLineID: string;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Adjustment Allocations
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderAdjustmentAllocationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderAdjustmentID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Adjustment Allocations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderAdjustmentAllocationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderAdjustmentID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Adjustment Allocations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderAdjustmentAllocationViewResult {
    @Field(() => [mjBizAppsOrdersOrderAdjustmentAllocation_])
    Results: mjBizAppsOrdersOrderAdjustmentAllocation_[];

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

@Resolver(mjBizAppsOrdersOrderAdjustmentAllocation_)
export class mjBizAppsOrdersOrderAdjustmentAllocationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderAdjustmentAllocationViewResult)
    async RunmjBizAppsOrdersOrderAdjustmentAllocationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderAdjustmentAllocationViewResult)
    async RunmjBizAppsOrdersOrderAdjustmentAllocationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderAdjustmentAllocationViewResult)
    async RunmjBizAppsOrdersOrderAdjustmentAllocationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Adjustment Allocations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderAdjustmentAllocation_, { nullable: true })
    async mjBizAppsOrdersOrderAdjustmentAllocation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderAdjustmentAllocation_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustment Allocations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustmentAllocations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustment Allocations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustment Allocations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderAdjustmentAllocation_)
    async CreatemjBizAppsOrdersOrderAdjustmentAllocation(
        @Arg('input', () => CreatemjBizAppsOrdersOrderAdjustmentAllocationInput) input: CreatemjBizAppsOrdersOrderAdjustmentAllocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Adjustment Allocations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderAdjustmentAllocation_)
    async UpdatemjBizAppsOrdersOrderAdjustmentAllocation(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderAdjustmentAllocationInput) input: UpdatemjBizAppsOrdersOrderAdjustmentAllocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Adjustment Allocations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderAdjustmentAllocation_)
    async DeletemjBizAppsOrdersOrderAdjustmentAllocation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Adjustment Allocations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Adjustments
//****************************************************************************
@ObjectType({ description: `An applied reduction. Serves as BOTH the applied discount and the redemption ledger - one concept, not two. Manual discounts (no promotion) ride the same table and must carry a Reason, enforced by CHECK, so an unexplained discount is unstorable rather than merely discouraged.` })
export class mjBizAppsOrdersOrderAdjustment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderHeaderID: string;
        
    @Field({nullable: true, description: `The line reduced. NULL means order-level, in which case OrderAdjustmentAllocation distributes it across lines.`}) 
    @MaxLength(36)
    OrderLineID?: string;
        
    @Field({nullable: true, description: `The promotion redeemed. NULL means a manual discount, which then requires a Reason and a SalesAuthority.`}) 
    @MaxLength(36)
    PromotionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PromotionCodeID?: string;
        
    @Field(() => Float, {description: `Always POSITIVE - it is a reduction, and the direction is carried by what the pipeline does with it rather than by the stored sign.`}) 
    Amount: number;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field({nullable: true, description: `Why this discount was given. Required when no promotion is named.`}) 
    Reason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AppliedByUserID?: string;
        
    @Field() 
    AppliedAt: Date;
        
    @Field({nullable: true, description: `Which SalesAuthority permitted a manual discount. Stamped so that lowering a rep's limit later does not retroactively make past discounts look unauthorized.`}) 
    @MaxLength(36)
    AuthorizedBySalesAuthorityID?: string;
        
    @Field({nullable: true, description: `Who approved a discount exceeding the applying user's authority. Over-limit discounts ESCALATE rather than being refused - a hard refusal is what pushes people to record the discount as something else.`}) 
    @MaxLength(36)
    ApprovedByUserID?: string;
        
    @Field({nullable: true}) 
    ApprovedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Promotion?: string;
        
    @Field(() => [mjBizAppsOrdersOrderAdjustmentAllocation_])
    mjBizAppsOrdersOrderAdjustmentAllocations_OrderAdjustmentIDArray: mjBizAppsOrdersOrderAdjustmentAllocation_[]; // Link to mjBizAppsOrdersOrderAdjustmentAllocations
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Adjustments
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderAdjustmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    OrderLineID: string | null;

    @Field({ nullable: true })
    PromotionID: string | null;

    @Field({ nullable: true })
    PromotionCodeID: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Reason: string | null;

    @Field({ nullable: true })
    AppliedByUserID: string | null;

    @Field({ nullable: true })
    AppliedAt?: Date;

    @Field({ nullable: true })
    AuthorizedBySalesAuthorityID: string | null;

    @Field({ nullable: true })
    ApprovedByUserID: string | null;

    @Field({ nullable: true })
    ApprovedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Adjustments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderAdjustmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    OrderLineID?: string | null;

    @Field({ nullable: true })
    PromotionID?: string | null;

    @Field({ nullable: true })
    PromotionCodeID?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Reason?: string | null;

    @Field({ nullable: true })
    AppliedByUserID?: string | null;

    @Field({ nullable: true })
    AppliedAt?: Date;

    @Field({ nullable: true })
    AuthorizedBySalesAuthorityID?: string | null;

    @Field({ nullable: true })
    ApprovedByUserID?: string | null;

    @Field({ nullable: true })
    ApprovedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Adjustments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderAdjustmentViewResult {
    @Field(() => [mjBizAppsOrdersOrderAdjustment_])
    Results: mjBizAppsOrdersOrderAdjustment_[];

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

@Resolver(mjBizAppsOrdersOrderAdjustment_)
export class mjBizAppsOrdersOrderAdjustmentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderAdjustmentViewResult)
    async RunmjBizAppsOrdersOrderAdjustmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderAdjustmentViewResult)
    async RunmjBizAppsOrdersOrderAdjustmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderAdjustmentViewResult)
    async RunmjBizAppsOrdersOrderAdjustmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Adjustments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderAdjustment_, { nullable: true })
    async mjBizAppsOrdersOrderAdjustment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderAdjustment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustmentAllocation_])
    async mjBizAppsOrdersOrderAdjustmentAllocations_OrderAdjustmentIDArray(@Root() mjbizappsordersorderadjustment_: mjBizAppsOrdersOrderAdjustment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustment Allocations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustmentAllocations')} WHERE ${provider.QuoteIdentifier('OrderAdjustmentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustment Allocations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderadjustment_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustment Allocations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersOrderAdjustment_)
    async CreatemjBizAppsOrdersOrderAdjustment(
        @Arg('input', () => CreatemjBizAppsOrdersOrderAdjustmentInput) input: CreatemjBizAppsOrdersOrderAdjustmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Adjustments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderAdjustment_)
    async UpdatemjBizAppsOrdersOrderAdjustment(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderAdjustmentInput) input: UpdatemjBizAppsOrdersOrderAdjustmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Adjustments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderAdjustment_)
    async DeletemjBizAppsOrdersOrderAdjustment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Adjustments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Charge Allocations
//****************************************************************************
@ObjectType({ description: `Which lines a charge belongs to. Needed for tax (per line), GL (per line\'s company) and returns (refunding a line refunds its share of the charge). The same shape as OrderAdjustmentAllocation, deliberately.` })
export class mjBizAppsOrdersOrderChargeAllocation_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderChargeID: string;
        
    @Field() 
    @MaxLength(36)
    OrderLineID: string;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Charge Allocations
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderChargeAllocationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderChargeID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Charge Allocations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderChargeAllocationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderChargeID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Charge Allocations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderChargeAllocationViewResult {
    @Field(() => [mjBizAppsOrdersOrderChargeAllocation_])
    Results: mjBizAppsOrdersOrderChargeAllocation_[];

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

@Resolver(mjBizAppsOrdersOrderChargeAllocation_)
export class mjBizAppsOrdersOrderChargeAllocationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderChargeAllocationViewResult)
    async RunmjBizAppsOrdersOrderChargeAllocationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderChargeAllocationViewResult)
    async RunmjBizAppsOrdersOrderChargeAllocationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderChargeAllocationViewResult)
    async RunmjBizAppsOrdersOrderChargeAllocationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Charge Allocations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderChargeAllocation_, { nullable: true })
    async mjBizAppsOrdersOrderChargeAllocation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderChargeAllocation_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Charge Allocations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderChargeAllocations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Charge Allocations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Charge Allocations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderChargeAllocation_)
    async CreatemjBizAppsOrdersOrderChargeAllocation(
        @Arg('input', () => CreatemjBizAppsOrdersOrderChargeAllocationInput) input: CreatemjBizAppsOrdersOrderChargeAllocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Charge Allocations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderChargeAllocation_)
    async UpdatemjBizAppsOrdersOrderChargeAllocation(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderChargeAllocationInput) input: UpdatemjBizAppsOrdersOrderChargeAllocationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Charge Allocations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderChargeAllocation_)
    async DeletemjBizAppsOrdersOrderChargeAllocation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Charge Allocations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Charges
//****************************************************************************
@ObjectType({ description: `An amount added to an order - shipping, handling, a tax layer. Computed, never hand-typed, but overridable ON THE RECORD: forbidding overrides outright is what gets worked around with a fake discount line, which is worse than the thing it prevents. A CHECK makes \'waived without saying why\' unstorable.` })
export class mjBizAppsOrdersOrderCharge_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderHeaderID: string;
        
    @Field() 
    @MaxLength(36)
    ChargeTypeID: string;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field(() => Float, {nullable: true, description: `What the charge was computed on, kept so the arithmetic can be reproduced.`}) 
    BasisAmount?: number;
        
    @Field(() => Float, {nullable: true, description: `The rate applied, for rate-driven charges such as tax.`}) 
    Rate?: number;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field({nullable: true, description: `For tax charges, the accounting TaxJurisdiction this layer came from. A soft reference across schemas.`}) 
    @MaxLength(36)
    TaxJurisdictionID?: string;
        
    @Field({nullable: true, description: `For tax charges, the accounting TaxRate that produced the number - provenance, so it can be defended years later.`}) 
    @MaxLength(36)
    TaxRateID?: string;
        
    @Field({description: `Internal, or the name of the external provider that returned this amount.`}) 
    @MaxLength(50)
    CalculationSource: string;
        
    @Field(() => Boolean, {description: `Whether a human replaced the computed amount. Requires a reason and preserves the computed value.`}) 
    IsOverridden: boolean;
        
    @Field(() => Float, {nullable: true, description: `What the charge would have been before the override.`}) 
    ComputedAmount?: number;
        
    @Field({nullable: true}) 
    OverrideReason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OverriddenByUserID?: string;
        
    @Field({nullable: true}) 
    OverriddenAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    ChargeType: string;
        
    @Field(() => [mjBizAppsOrdersOrderChargeAllocation_])
    mjBizAppsOrdersOrderChargeAllocations_OrderChargeIDArray: mjBizAppsOrdersOrderChargeAllocation_[]; // Link to mjBizAppsOrdersOrderChargeAllocations
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Charges
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderChargeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    ChargeTypeID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    BasisAmount: number | null;

    @Field(() => Float, { nullable: true })
    Rate: number | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    TaxJurisdictionID: string | null;

    @Field({ nullable: true })
    TaxRateID: string | null;

    @Field({ nullable: true })
    CalculationSource?: string;

    @Field(() => Boolean, { nullable: true })
    IsOverridden?: boolean;

    @Field(() => Float, { nullable: true })
    ComputedAmount: number | null;

    @Field({ nullable: true })
    OverrideReason: string | null;

    @Field({ nullable: true })
    OverriddenByUserID: string | null;

    @Field({ nullable: true })
    OverriddenAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Charges
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderChargeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    ChargeTypeID?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    BasisAmount?: number | null;

    @Field(() => Float, { nullable: true })
    Rate?: number | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    TaxJurisdictionID?: string | null;

    @Field({ nullable: true })
    TaxRateID?: string | null;

    @Field({ nullable: true })
    CalculationSource?: string;

    @Field(() => Boolean, { nullable: true })
    IsOverridden?: boolean;

    @Field(() => Float, { nullable: true })
    ComputedAmount?: number | null;

    @Field({ nullable: true })
    OverrideReason?: string | null;

    @Field({ nullable: true })
    OverriddenByUserID?: string | null;

    @Field({ nullable: true })
    OverriddenAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Charges
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderChargeViewResult {
    @Field(() => [mjBizAppsOrdersOrderCharge_])
    Results: mjBizAppsOrdersOrderCharge_[];

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

@Resolver(mjBizAppsOrdersOrderCharge_)
export class mjBizAppsOrdersOrderChargeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderChargeViewResult)
    async RunmjBizAppsOrdersOrderChargeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderChargeViewResult)
    async RunmjBizAppsOrdersOrderChargeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderChargeViewResult)
    async RunmjBizAppsOrdersOrderChargeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Charges';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderCharge_, { nullable: true })
    async mjBizAppsOrdersOrderCharge(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderCharge_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Charges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderCharges')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Charges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Charges', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderChargeAllocation_])
    async mjBizAppsOrdersOrderChargeAllocations_OrderChargeIDArray(@Root() mjbizappsordersordercharge_: mjBizAppsOrdersOrderCharge_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Charge Allocations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderChargeAllocations')} WHERE ${provider.QuoteIdentifier('OrderChargeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Charge Allocations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersordercharge_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Charge Allocations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersOrderCharge_)
    async CreatemjBizAppsOrdersOrderCharge(
        @Arg('input', () => CreatemjBizAppsOrdersOrderChargeInput) input: CreatemjBizAppsOrdersOrderChargeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Charges', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderCharge_)
    async UpdatemjBizAppsOrdersOrderCharge(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderChargeInput) input: UpdatemjBizAppsOrdersOrderChargeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Charges', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderCharge_)
    async DeletemjBizAppsOrdersOrderCharge(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Charges', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Company Policies
//****************************************************************************
@ObjectType({ description: `Per-company pricing policy. IS-A __mj.Company: ID is the Company ID, mirroring accounting\'s AccountingCompanyProfile. A company with no row takes the defaults, so this never needs backfilling.` })
export class mjBizAppsOrdersOrderCompanyPolicy_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field(() => Boolean, {description: `Company-level flip permitting promotions to combine at all. A promotion must ALSO opt in via its own AllowsStacking.`}) 
    AllowPromotionStacking: boolean;
        
    @Field({description: `Sequential (each promotion applies to the running total: ten percent then ten percent is nineteen) or Additive (percentages sum: twenty). Per company rather than per promotion, because the mode describes how a SET combines and two promotions disagreeing has no coherent answer. Sequential is the default because it discounts less, so a misconfiguration costs nothing.`}) 
    @MaxLength(20)
    StackingMode: string;
        
    @Field(() => Boolean, {description: `When nothing prices a line and no UnitPrice was supplied, refuse it rather than booking zero. A silently-zero price is an invoice for nothing that looks deliberate.`}) 
    RefuseUnpricedLines: boolean;
        
    @Field({nullable: true, description: `Fallback list for customers with no assignment of their own.`}) 
    @MaxLength(36)
    DefaultPriceListID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DefaultPriceList?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Company Policies
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderCompanyPolicyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field(() => Boolean, { nullable: true })
    AllowPromotionStacking?: boolean;

    @Field({ nullable: true })
    StackingMode?: string;

    @Field(() => Boolean, { nullable: true })
    RefuseUnpricedLines?: boolean;

    @Field({ nullable: true })
    DefaultPriceListID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Company Policies
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderCompanyPolicyInput {
    @Field()
    ID: string;

    @Field(() => Boolean, { nullable: true })
    AllowPromotionStacking?: boolean;

    @Field({ nullable: true })
    StackingMode?: string;

    @Field(() => Boolean, { nullable: true })
    RefuseUnpricedLines?: boolean;

    @Field({ nullable: true })
    DefaultPriceListID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Company Policies
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderCompanyPolicyViewResult {
    @Field(() => [mjBizAppsOrdersOrderCompanyPolicy_])
    Results: mjBizAppsOrdersOrderCompanyPolicy_[];

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

@Resolver(mjBizAppsOrdersOrderCompanyPolicy_)
export class mjBizAppsOrdersOrderCompanyPolicyResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderCompanyPolicyViewResult)
    async RunmjBizAppsOrdersOrderCompanyPolicyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderCompanyPolicyViewResult)
    async RunmjBizAppsOrdersOrderCompanyPolicyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderCompanyPolicyViewResult)
    async RunmjBizAppsOrdersOrderCompanyPolicyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Company Policies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderCompanyPolicy_, { nullable: true })
    async mjBizAppsOrdersOrderCompanyPolicy(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderCompanyPolicy_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Company Policies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderCompanyPolicies')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Company Policies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Company Policies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderCompanyPolicy_)
    async CreatemjBizAppsOrdersOrderCompanyPolicy(
        @Arg('input', () => CreatemjBizAppsOrdersOrderCompanyPolicyInput) input: CreatemjBizAppsOrdersOrderCompanyPolicyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Company Policies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderCompanyPolicy_)
    async UpdatemjBizAppsOrdersOrderCompanyPolicy(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderCompanyPolicyInput) input: UpdatemjBizAppsOrdersOrderCompanyPolicyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Company Policies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderCompanyPolicy_)
    async DeletemjBizAppsOrdersOrderCompanyPolicy(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Company Policies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Headers
//****************************************************************************
@ObjectType({ description: `An order header — the customer\'s commitment AND the receivable (D2). On the FIRST transition to Confirmed, one balanced journal entry per line is booked into BizApps Accounting (D10). CompanyID is the originating/owning company — a document/visibility anchor, never GL resolution. No currency columns (FX deferred, D24).` })
export class mjBizAppsOrdersOrderHeader_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable order identifier. Unique.`}) 
    @MaxLength(40)
    OrderNumber: string;
        
    @Field({description: `Sale | Return | Cancellation | Amendment | AccountCredit. Non-Sale types are the correction/reversal document family (BO-D9/D15). AccountCredit is a DELIBERATELY ISSUED credit document; an ordinary Sale order can also carry a credit balance simply by being over-paid, and both are spendable through the Account Credit payment type (D68).`}) 
    @MaxLength(20)
    OrderType: string;
        
    @Field({description: `Effective date of the order; used as the journal entry EffectiveDate and the as-of date for GL-account link resolution.`}) 
    OrderDate: Date;
        
    @Field({description: `Draft | Quoted | Confirmed | Posted | Fulfilled | Voided. Voided is reachable only from Draft/Quoted; the JE fires once on the first Confirmed.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({description: `The ORIGINATING/owning company (D6): document, visibility, and sales-attribution anchor (pairs with SalesRepUserID). NEVER used for GL resolution — revenue company is per line via the product's company. FK to __mj.Company.`}) 
    @MaxLength(36)
    CompanyID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    BillToPersonID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the paying organization (D65). Nullable; a personal order names only a person.`}) 
    @MaxLength(36)
    BillToOrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SalesRepUserID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.`}) 
    @MaxLength(36)
    BillToAddressID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.`}) 
    @MaxLength(36)
    ShipToAddressID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToOrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToPersonID?: string;
        
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
        
    @Field({nullable: true}) 
    @MaxLength(36)
    InitialPaymentTypeID?: string;
        
    @Field(() => Float) 
    InitialPaymentAmount: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    InitialPaymentDetailID?: string;
        
    @Field({nullable: true, description: `UTC timestamp of the transition to Posted — the issue/tax-point date of the invoice.`}) 
    PostedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PostedByUserID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ReversesOrderHeaderID?: string;
        
    @Field({nullable: true, description: `Reason this order reverses another (required by validation when ReversesOrderHeaderID is set).`}) 
    ReversalReason?: string;
        
    @Field({nullable: true, description: `Customer-requested delivery/service date. Informational.`}) 
    RequestedDeliveryDate?: Date;
        
    @Field({nullable: true, description: `Soft reference (no FK) to the __mj_BizAppsTasks Task raised when a sales rule blocked Confirm (BO-D17). Convenience pointer; Task Links carry the authoritative linkage.`}) 
    @MaxLength(36)
    ApprovalTaskID?: string;
        
    @Field({nullable: true, description: `Optional free-text description / memo for the order.`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Internal notes on the order (Description is the customer-facing memo).`}) 
    Notes?: string;
        
    @Field({nullable: true, description: `UTC timestamp of the first transition to Confirmed.`}) 
    ConfirmedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    BillToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    BillToOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    SalesRepUser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    BillToAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ShipToAddress?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ShipToOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    ShipToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentTermsType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    InitialPaymentType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    InitialPaymentDetail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    PostedByUser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    ReversesOrderHeader?: string;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Latitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    _mj__Longitude?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootReversesOrderHeaderID?: string;
        
    @Field(() => [mjBizAppsOrdersOrderAdjustment_])
    mjBizAppsOrdersOrderAdjustments_OrderHeaderIDArray: mjBizAppsOrdersOrderAdjustment_[]; // Link to mjBizAppsOrdersOrderAdjustments
    
    @Field(() => [mjBizAppsOrdersOrderCharge_])
    mjBizAppsOrdersOrderCharges_OrderHeaderIDArray: mjBizAppsOrdersOrderCharge_[]; // Link to mjBizAppsOrdersOrderCharges
    
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    mjBizAppsOrdersPaymentLines_OrderHeaderIDArray: mjBizAppsOrdersPaymentLine_[]; // Link to mjBizAppsOrdersPaymentLines
    
    @Field(() => [mjBizAppsOrdersPaymentIntent_])
    mjBizAppsOrdersPaymentIntents_OrderHeaderIDArray: mjBizAppsOrdersPaymentIntent_[]; // Link to mjBizAppsOrdersPaymentIntents
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_OrderHeaderIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
    @Field(() => [mjBizAppsOrdersOrderHeader_])
    mjBizAppsOrdersOrderHeaders_ReversesOrderHeaderIDArray: mjBizAppsOrdersOrderHeader_[]; // Link to mjBizAppsOrdersOrderHeaders
    
    @Field(() => [mjBizAppsOrdersStoredValueTransaction_])
    mjBizAppsOrdersStoredValueTransactions_RelatedOrderHeaderIDArray: mjBizAppsOrdersStoredValueTransaction_[]; // Link to mjBizAppsOrdersStoredValueTransactions
    
    @Field(() => [mjBizAppsOrdersSubscriptionEvent_])
    mjBizAppsOrdersSubscriptionEvents_RelatedOrderHeaderIDArray: mjBizAppsOrdersSubscriptionEvent_[]; // Link to mjBizAppsOrdersSubscriptionEvents
    
    @Field(() => [mjBizAppsOrdersPaymentDetail_])
    mjBizAppsOrdersPaymentDetails_SourceOrderHeaderIDArray: mjBizAppsOrdersPaymentDetail_[]; // Link to mjBizAppsOrdersPaymentDetails
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Headers
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderHeaderInput {
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
    CompanyID?: string;

    @Field({ nullable: true })
    BillToPersonID: string | null;

    @Field({ nullable: true })
    BillToOrganizationID: string | null;

    @Field({ nullable: true })
    SalesRepUserID: string | null;

    @Field({ nullable: true })
    BillToAddressID: string | null;

    @Field({ nullable: true })
    ShipToAddressID: string | null;

    @Field({ nullable: true })
    ShipToOrganizationID: string | null;

    @Field({ nullable: true })
    ShipToPersonID: string | null;

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
    InitialPaymentTypeID: string | null;

    @Field(() => Float, { nullable: true })
    InitialPaymentAmount?: number;

    @Field({ nullable: true })
    InitialPaymentDetailID: string | null;

    @Field({ nullable: true })
    PostedAt: Date | null;

    @Field({ nullable: true })
    PostedByUserID: string | null;

    @Field({ nullable: true })
    ReversesOrderHeaderID: string | null;

    @Field({ nullable: true })
    ReversalReason: string | null;

    @Field({ nullable: true })
    RequestedDeliveryDate: Date | null;

    @Field({ nullable: true })
    ApprovalTaskID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field({ nullable: true })
    ConfirmedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Headers
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderHeaderInput {
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
    CompanyID?: string;

    @Field({ nullable: true })
    BillToPersonID?: string | null;

    @Field({ nullable: true })
    BillToOrganizationID?: string | null;

    @Field({ nullable: true })
    SalesRepUserID?: string | null;

    @Field({ nullable: true })
    BillToAddressID?: string | null;

    @Field({ nullable: true })
    ShipToAddressID?: string | null;

    @Field({ nullable: true })
    ShipToOrganizationID?: string | null;

    @Field({ nullable: true })
    ShipToPersonID?: string | null;

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
    InitialPaymentTypeID?: string | null;

    @Field(() => Float, { nullable: true })
    InitialPaymentAmount?: number;

    @Field({ nullable: true })
    InitialPaymentDetailID?: string | null;

    @Field({ nullable: true })
    PostedAt?: Date | null;

    @Field({ nullable: true })
    PostedByUserID?: string | null;

    @Field({ nullable: true })
    ReversesOrderHeaderID?: string | null;

    @Field({ nullable: true })
    ReversalReason?: string | null;

    @Field({ nullable: true })
    RequestedDeliveryDate?: Date | null;

    @Field({ nullable: true })
    ApprovalTaskID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field({ nullable: true })
    ConfirmedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Headers
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderHeaderViewResult {
    @Field(() => [mjBizAppsOrdersOrderHeader_])
    Results: mjBizAppsOrdersOrderHeader_[];

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

@Resolver(mjBizAppsOrdersOrderHeader_)
export class mjBizAppsOrdersOrderHeaderResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderHeaderViewResult)
    async RunmjBizAppsOrdersOrderHeaderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderHeaderViewResult)
    async RunmjBizAppsOrdersOrderHeaderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderHeaderViewResult)
    async RunmjBizAppsOrdersOrderHeaderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Headers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderHeader_, { nullable: true })
    async mjBizAppsOrdersOrderHeader(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderHeader_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderHeaders')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Headers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustment_])
    async mjBizAppsOrdersOrderAdjustments_OrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustments')} WHERE ${provider.QuoteIdentifier('OrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderCharge_])
    async mjBizAppsOrdersOrderCharges_OrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Charges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderCharges')} WHERE ${provider.QuoteIdentifier('OrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Charges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Charges', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentLine_])
    async mjBizAppsOrdersPaymentLines_OrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentLines')} WHERE ${provider.QuoteIdentifier('OrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentIntent_])
    async mjBizAppsOrdersPaymentIntents_OrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Intents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentIntents')} WHERE ${provider.QuoteIdentifier('OrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Intents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Intents', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_OrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('OrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderHeader_])
    async mjBizAppsOrdersOrderHeaders_ReversesOrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderHeaders')} WHERE ${provider.QuoteIdentifier('ReversesOrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersStoredValueTransaction_])
    async mjBizAppsOrdersStoredValueTransactions_RelatedOrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Stored Value Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwStoredValueTransactions')} WHERE ${provider.QuoteIdentifier('RelatedOrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Stored Value Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Stored Value Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscriptionEvent_])
    async mjBizAppsOrdersSubscriptionEvents_RelatedOrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionEvents')} WHERE ${provider.QuoteIdentifier('RelatedOrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Events', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentDetail_])
    async mjBizAppsOrdersPaymentDetails_SourceOrderHeaderIDArray(@Root() mjbizappsordersorderheader_: mjBizAppsOrdersOrderHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentDetails')} WHERE ${provider.QuoteIdentifier('SourceOrderHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersOrderHeader_)
    async CreatemjBizAppsOrdersOrderHeader(
        @Arg('input', () => CreatemjBizAppsOrdersOrderHeaderInput) input: CreatemjBizAppsOrdersOrderHeaderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Headers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderHeader_)
    async UpdatemjBizAppsOrdersOrderHeader(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderHeaderInput) input: UpdatemjBizAppsOrdersOrderHeaderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Headers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderHeader_)
    async DeletemjBizAppsOrdersOrderHeader(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Headers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Line Dimensions
//****************************************************************************
@ObjectType({ description: `Analytical dimension tag on an order line (one value per dimension). Soft refs to __mj_BizAppsAccounting Dimension/DimensionValue; the booking draft propagates tags onto JE lines for batch-dimension detail.` })
export class mjBizAppsOrdersOrderLineDimension_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderLineID: string;
        
    @Field({description: `FK to __mj_BizAppsAccounting.Dimension.`}) 
    @MaxLength(36)
    DimensionID: string;
        
    @Field({description: `FK to __mj_BizAppsAccounting.DimensionValue.`}) 
    @MaxLength(36)
    DimensionValueID: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Dimension: string;
        
    @Field() 
    @MaxLength(200)
    DimensionValue: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Line Dimensions
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderLineDimensionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field({ nullable: true })
    DimensionID?: string;

    @Field({ nullable: true })
    DimensionValueID?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Line Dimensions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderLineDimensionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field({ nullable: true })
    DimensionID?: string;

    @Field({ nullable: true })
    DimensionValueID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Line Dimensions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderLineDimensionViewResult {
    @Field(() => [mjBizAppsOrdersOrderLineDimension_])
    Results: mjBizAppsOrdersOrderLineDimension_[];

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

@Resolver(mjBizAppsOrdersOrderLineDimension_)
export class mjBizAppsOrdersOrderLineDimensionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderLineDimensionViewResult)
    async RunmjBizAppsOrdersOrderLineDimensionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderLineDimensionViewResult)
    async RunmjBizAppsOrdersOrderLineDimensionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderLineDimensionViewResult)
    async RunmjBizAppsOrdersOrderLineDimensionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Line Dimensions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderLineDimension_, { nullable: true })
    async mjBizAppsOrdersOrderLineDimension(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderLineDimension_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Line Dimensions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLineDimensions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Line Dimensions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Line Dimensions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderLineDimension_)
    async CreatemjBizAppsOrdersOrderLineDimension(
        @Arg('input', () => CreatemjBizAppsOrdersOrderLineDimensionInput) input: CreatemjBizAppsOrdersOrderLineDimensionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Line Dimensions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderLineDimension_)
    async UpdatemjBizAppsOrdersOrderLineDimension(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderLineDimensionInput) input: UpdatemjBizAppsOrdersOrderLineDimensionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Line Dimensions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderLineDimension_)
    async DeletemjBizAppsOrdersOrderLineDimension(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Line Dimensions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Line Price Components
//****************************************************************************
@ObjectType({ description: `How a line\'s total was arrived at, one row per pipeline stage with a running total. Pricing disputes are inevitable and \'the system computed it\' is not an answer to a customer or an auditor. Provenance uses the polymorphic origin pair so a component can point at a ProductPrice, a Promotion, an OrderCharge or a TaxRate without a column per source type.` })
export class mjBizAppsOrdersOrderLinePriceComponent_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderLineID: string;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field({description: `Base | Rule | Adjustment | Charge | Tax - which pipeline stage produced this component.`}) 
    @MaxLength(20)
    ComponentType: string;
        
    @Field() 
    @MaxLength(200)
    Label: string;
        
    @Field(() => Float, {description: `SIGNED: negative for a discount, positive for a charge.`}) 
    Amount: number;
        
    @Field(() => Float, {description: `The line total after this component, so the decomposition reads top to bottom.`}) 
    RunningTotal: number;
        
    @Field({nullable: true, description: `The MJ Entity of whatever produced this component. Set together with SourceRecordID, or neither.`}) 
    @MaxLength(36)
    SourceEntityID?: string;
        
    @Field({nullable: true, description: `Primary key of the producing record, as text. A soft reference by nature - it points at whichever table the stage used.`}) 
    @MaxLength(400)
    SourceRecordID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    SourceEntity?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Line Price Components
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderLinePriceComponentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    ComponentType?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    RunningTotal?: number;

    @Field({ nullable: true })
    SourceEntityID: string | null;

    @Field({ nullable: true })
    SourceRecordID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Line Price Components
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersOrderLinePriceComponentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    ComponentType?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    RunningTotal?: number;

    @Field({ nullable: true })
    SourceEntityID?: string | null;

    @Field({ nullable: true })
    SourceRecordID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Order Line Price Components
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersOrderLinePriceComponentViewResult {
    @Field(() => [mjBizAppsOrdersOrderLinePriceComponent_])
    Results: mjBizAppsOrdersOrderLinePriceComponent_[];

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

@Resolver(mjBizAppsOrdersOrderLinePriceComponent_)
export class mjBizAppsOrdersOrderLinePriceComponentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersOrderLinePriceComponentViewResult)
    async RunmjBizAppsOrdersOrderLinePriceComponentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderLinePriceComponentViewResult)
    async RunmjBizAppsOrdersOrderLinePriceComponentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersOrderLinePriceComponentViewResult)
    async RunmjBizAppsOrdersOrderLinePriceComponentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Order Line Price Components';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersOrderLinePriceComponent_, { nullable: true })
    async mjBizAppsOrdersOrderLinePriceComponent(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersOrderLinePriceComponent_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Line Price Components', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLinePriceComponents')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Line Price Components', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Line Price Components', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersOrderLinePriceComponent_)
    async CreatemjBizAppsOrdersOrderLinePriceComponent(
        @Arg('input', () => CreatemjBizAppsOrdersOrderLinePriceComponentInput) input: CreatemjBizAppsOrdersOrderLinePriceComponentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Order Line Price Components', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersOrderLinePriceComponent_)
    async UpdatemjBizAppsOrdersOrderLinePriceComponent(
        @Arg('input', () => UpdatemjBizAppsOrdersOrderLinePriceComponentInput) input: UpdatemjBizAppsOrdersOrderLinePriceComponentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Order Line Price Components', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersOrderLinePriceComponent_)
    async DeletemjBizAppsOrdersOrderLinePriceComponent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Order Line Price Components', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Order Lines
//****************************************************************************
@ObjectType({ description: `A line item on an order. Line amount = Quantity * UnitPrice. Each line books its OWN journal entry at Confirm (D10) in the line\'s company.` })
export class mjBizAppsOrdersOrderLine_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    OrderHeaderID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field({description: `Denormalized stamp of the product's company at line save (D6): perf/reporting + temporal integrity — records who owned the product at transaction time. Derived from Product.CompanyID, never authored. FK to __mj.Company.`}) 
    @MaxLength(36)
    CompanyID: string;
        
    @Field(() => Int, {description: `Order-scoped line sequence (1..n), unique within the order.`}) 
    LineNumber: number;
        
    @Field(() => Float, {description: `Quantity ordered (> 0).`}) 
    Quantity: number;
        
    @Field(() => Float, {description: `Unit price (>= 0). Multiplied by Quantity to get the line amount booked to revenue.`}) 
    UnitPrice: number;
        
    @Field({nullable: true, description: `Which price RULE produced UnitPrice. UnitPrice still stamps; this records why, so a disputed invoice can be traced back to the rule that priced it. NULL when the caller supplied the price directly, which remains valid.`}) 
    @MaxLength(36)
    ProductPriceID?: string;
        
    @Field(() => Float, {description: `Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).`}) 
    DiscountPct: number;
        
    @Field(() => Float, {nullable: true, description: `Engine-computed stored net line total = Quantity * UnitPrice * (1 - DiscountPct). Frozen after Confirm.`}) 
    LineTotalNet?: number;
        
    @Field(() => Float, {description: `Tax amount for this line. 0 until the tax subsystem lands (O4).`}) 
    LineTax: number;
        
    @Field(() => Float, {nullable: true, description: `Engine-computed stored gross line total = LineTotalNet + LineTax. Frozen after Confirm.`}) 
    LineTotalGross?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToAddressID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToOrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ShipToPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RenewsSubscriptionID?: string;
        
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
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SubscriptionID?: string;
        
    @Field({nullable: true, description: `The revenue recognition schedule this line carries (Deferred products). Each renewal order line carries its own schedule.`}) 
    @MaxLength(36)
    RevenueRecognitionScheduleID?: string;
        
    @Field({nullable: true, description: `Optional free-text description for the line.`}) 
    @MaxLength(500)
    Description?: string;
        
    @Field({nullable: true, description: `FK to the __mj_BizAppsAccounting.JournalEntry booked for THIS line at Confirm. NULL until booked; NULL->value once, never cleared or replaced (trigger). The order's journal entry is the aggregate of its lines' JEs.`}) 
    @MaxLength(36)
    JournalEntryID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Product: string;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ShipToOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    ShipToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    SourceBundleProduct?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    JournalEntry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootReversesOrderLineID?: string;
        
    @Field(() => [mjBizAppsOrdersOrderLinePriceComponent_])
    mjBizAppsOrdersOrderLinePriceComponents_OrderLineIDArray: mjBizAppsOrdersOrderLinePriceComponent_[]; // Link to mjBizAppsOrdersOrderLinePriceComponents
    
    @Field(() => [mjBizAppsOrdersOrderAdjustmentAllocation_])
    mjBizAppsOrdersOrderAdjustmentAllocations_OrderLineIDArray: mjBizAppsOrdersOrderAdjustmentAllocation_[]; // Link to mjBizAppsOrdersOrderAdjustmentAllocations
    
    @Field(() => [mjBizAppsOrdersStoredValueAccount_])
    mjBizAppsOrdersStoredValueAccounts_IssuedFromOrderLineIDArray: mjBizAppsOrdersStoredValueAccount_[]; // Link to mjBizAppsOrdersStoredValueAccounts
    
    @Field(() => [mjBizAppsOrdersEntitlementGrant_])
    mjBizAppsOrdersEntitlementGrants_OrderLineIDArray: mjBizAppsOrdersEntitlementGrant_[]; // Link to mjBizAppsOrdersEntitlementGrants
    
    @Field(() => [mjBizAppsOrdersOrderChargeAllocation_])
    mjBizAppsOrdersOrderChargeAllocations_OrderLineIDArray: mjBizAppsOrdersOrderChargeAllocation_[]; // Link to mjBizAppsOrdersOrderChargeAllocations
    
    @Field(() => [mjBizAppsOrdersOrderAdjustment_])
    mjBizAppsOrdersOrderAdjustments_OrderLineIDArray: mjBizAppsOrdersOrderAdjustment_[]; // Link to mjBizAppsOrdersOrderAdjustments
    
    @Field(() => [mjBizAppsOrdersSubscription_])
    mjBizAppsOrdersSubscriptions_OrderLineIDArray: mjBizAppsOrdersSubscription_[]; // Link to mjBizAppsOrdersSubscriptions
    
    @Field(() => [mjBizAppsOrdersSubscriptionTerm_])
    mjBizAppsOrdersSubscriptionTerms_OrderLineIDArray: mjBizAppsOrdersSubscriptionTerm_[]; // Link to mjBizAppsOrdersSubscriptionTerms
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_ReversesOrderLineIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
    @Field(() => [mjBizAppsOrdersEventOrderLine_])
    mjBizAppsOrdersEventOrderLines_IDArray: mjBizAppsOrdersEventOrderLine_[]; // Link to mjBizAppsOrdersEventOrderLines
    
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    mjBizAppsOrdersPaymentLines_OrderLineIDArray: mjBizAppsOrdersPaymentLine_[]; // Link to mjBizAppsOrdersPaymentLines
    
    @Field(() => [mjBizAppsOrdersOrderLineDimension_])
    mjBizAppsOrdersOrderLineDimensions_OrderLineIDArray: mjBizAppsOrdersOrderLineDimension_[]; // Link to mjBizAppsOrdersOrderLineDimensions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Order Lines
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersOrderLineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field(() => Int, { nullable: true })
    LineNumber?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    ProductPriceID: string | null;

    @Field(() => Float, { nullable: true })
    DiscountPct?: number;

    @Field(() => Float, { nullable: true })
    LineTotalNet: number | null;

    @Field(() => Float, { nullable: true })
    LineTax?: number;

    @Field(() => Float, { nullable: true })
    LineTotalGross: number | null;

    @Field({ nullable: true })
    ShipToAddressID: string | null;

    @Field({ nullable: true })
    ShipToOrganizationID: string | null;

    @Field({ nullable: true })
    ShipToPersonID: string | null;

    @Field({ nullable: true })
    RenewsSubscriptionID: string | null;

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
    SubscriptionID: string | null;

    @Field({ nullable: true })
    RevenueRecognitionScheduleID: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    JournalEntryID: string | null;

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
    OrderHeaderID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field(() => Int, { nullable: true })
    LineNumber?: number;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field(() => Float, { nullable: true })
    UnitPrice?: number;

    @Field({ nullable: true })
    ProductPriceID?: string | null;

    @Field(() => Float, { nullable: true })
    DiscountPct?: number;

    @Field(() => Float, { nullable: true })
    LineTotalNet?: number | null;

    @Field(() => Float, { nullable: true })
    LineTax?: number;

    @Field(() => Float, { nullable: true })
    LineTotalGross?: number | null;

    @Field({ nullable: true })
    ShipToAddressID?: string | null;

    @Field({ nullable: true })
    ShipToOrganizationID?: string | null;

    @Field({ nullable: true })
    ShipToPersonID?: string | null;

    @Field({ nullable: true })
    RenewsSubscriptionID?: string | null;

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
    SubscriptionID?: string | null;

    @Field({ nullable: true })
    RevenueRecognitionScheduleID?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    JournalEntryID?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersOrderLinePriceComponent_])
    async mjBizAppsOrdersOrderLinePriceComponents_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Line Price Components', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLinePriceComponents')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Line Price Components', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Line Price Components', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustmentAllocation_])
    async mjBizAppsOrdersOrderAdjustmentAllocations_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustment Allocations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustmentAllocations')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustment Allocations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustment Allocations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersStoredValueAccount_])
    async mjBizAppsOrdersStoredValueAccounts_IssuedFromOrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Stored Value Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwStoredValueAccounts')} WHERE ${provider.QuoteIdentifier('IssuedFromOrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Stored Value Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Stored Value Accounts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersEntitlementGrant_])
    async mjBizAppsOrdersEntitlementGrants_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Entitlement Grants', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEntitlementGrants')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Entitlement Grants', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Entitlement Grants', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderChargeAllocation_])
    async mjBizAppsOrdersOrderChargeAllocations_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Charge Allocations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderChargeAllocations')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Charge Allocations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Charge Allocations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustment_])
    async mjBizAppsOrdersOrderAdjustments_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustments')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscription_])
    async mjBizAppsOrdersSubscriptions_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscriptionTerm_])
    async mjBizAppsOrdersSubscriptionTerms_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Terms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionTerms')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Terms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Terms', rows, this.GetUserFromPayload(userPayload));
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
        
    @FieldResolver(() => [mjBizAppsOrdersEventOrderLine_])
    async mjBizAppsOrdersEventOrderLines_IDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Event Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEventOrderLines')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Event Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Event Order Lines', rows, this.GetUserFromPayload(userPayload));
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
        
    @FieldResolver(() => [mjBizAppsOrdersOrderLineDimension_])
    async mjBizAppsOrdersOrderLineDimensions_OrderLineIDArray(@Root() mjbizappsordersorderline_: mjBizAppsOrdersOrderLine_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Line Dimensions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLineDimensions')} WHERE ${provider.QuoteIdentifier('OrderLineID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Line Dimensions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersorderline_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Line Dimensions', rows, this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for MJ_BizApps_Orders: Payment Details
//****************************************************************************
@ObjectType()
export class mjBizAppsOrdersPaymentDetail_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    CompanyID: string;
        
    @Field() 
    @MaxLength(36)
    PaymentTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PaymentProviderID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SourceCustomerPaymentMethodID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ProviderCustomerRef?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ProviderInstrumentRef?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    Brand?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    Last4?: string;
        
    @Field(() => Int, {nullable: true}) 
    ExpiryMonth?: number;
        
    @Field(() => Int, {nullable: true}) 
    ExpiryYear?: number;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    HolderName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    BankName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    RoutingLast4?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    AccountLast4?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    BankAccountType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ReferenceNumber?: string;
        
    @Field({nullable: true}) 
    InstrumentDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    StoredValueAccountID?: string;
        
    @Field({nullable: true, description: `ACCOUNT CREDIT tender (D68): the order whose NEGATIVE balance this payment draws down. A customer credit is not its own instrument the way a gift card is — it already lives on the over-paid order — so this points at that order rather than duplicating the balance onto a second record. NULL for every other tender type.`}) 
    @MaxLength(36)
    SourceOrderHeaderID?: string;
        
    @Field({nullable: true}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field() 
    @MaxLength(200)
    PaymentType: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentProvider?: string;
        
    @Field(() => [mjBizAppsOrdersOrderHeader_])
    mjBizAppsOrdersOrderHeaders_InitialPaymentDetailIDArray: mjBizAppsOrdersOrderHeader_[]; // Link to mjBizAppsOrdersOrderHeaders
    
    @Field(() => [mjBizAppsOrdersCustomerPaymentMethod_])
    mjBizAppsOrdersCustomerPaymentMethods_PaymentDetailIDArray: mjBizAppsOrdersCustomerPaymentMethod_[]; // Link to mjBizAppsOrdersCustomerPaymentMethods
    
    @Field(() => [mjBizAppsOrdersPaymentHeader_])
    mjBizAppsOrdersPaymentHeaders_PaymentDetailIDArray: mjBizAppsOrdersPaymentHeader_[]; // Link to mjBizAppsOrdersPaymentHeaders
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Details
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentDetailInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    PaymentTypeID?: string;

    @Field({ nullable: true })
    PaymentProviderID: string | null;

    @Field({ nullable: true })
    SourceCustomerPaymentMethodID: string | null;

    @Field({ nullable: true })
    ProviderCustomerRef: string | null;

    @Field({ nullable: true })
    ProviderInstrumentRef: string | null;

    @Field({ nullable: true })
    Brand: string | null;

    @Field({ nullable: true })
    Last4: string | null;

    @Field(() => Int, { nullable: true })
    ExpiryMonth: number | null;

    @Field(() => Int, { nullable: true })
    ExpiryYear: number | null;

    @Field({ nullable: true })
    HolderName: string | null;

    @Field({ nullable: true })
    BankName: string | null;

    @Field({ nullable: true })
    RoutingLast4: string | null;

    @Field({ nullable: true })
    AccountLast4: string | null;

    @Field({ nullable: true })
    BankAccountType: string | null;

    @Field({ nullable: true })
    ReferenceNumber: string | null;

    @Field({ nullable: true })
    InstrumentDate: Date | null;

    @Field({ nullable: true })
    StoredValueAccountID: string | null;

    @Field({ nullable: true })
    SourceOrderHeaderID: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Details
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentDetailInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    PaymentTypeID?: string;

    @Field({ nullable: true })
    PaymentProviderID?: string | null;

    @Field({ nullable: true })
    SourceCustomerPaymentMethodID?: string | null;

    @Field({ nullable: true })
    ProviderCustomerRef?: string | null;

    @Field({ nullable: true })
    ProviderInstrumentRef?: string | null;

    @Field({ nullable: true })
    Brand?: string | null;

    @Field({ nullable: true })
    Last4?: string | null;

    @Field(() => Int, { nullable: true })
    ExpiryMonth?: number | null;

    @Field(() => Int, { nullable: true })
    ExpiryYear?: number | null;

    @Field({ nullable: true })
    HolderName?: string | null;

    @Field({ nullable: true })
    BankName?: string | null;

    @Field({ nullable: true })
    RoutingLast4?: string | null;

    @Field({ nullable: true })
    AccountLast4?: string | null;

    @Field({ nullable: true })
    BankAccountType?: string | null;

    @Field({ nullable: true })
    ReferenceNumber?: string | null;

    @Field({ nullable: true })
    InstrumentDate?: Date | null;

    @Field({ nullable: true })
    StoredValueAccountID?: string | null;

    @Field({ nullable: true })
    SourceOrderHeaderID?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Details
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentDetailViewResult {
    @Field(() => [mjBizAppsOrdersPaymentDetail_])
    Results: mjBizAppsOrdersPaymentDetail_[];

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

@Resolver(mjBizAppsOrdersPaymentDetail_)
export class mjBizAppsOrdersPaymentDetailResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentDetailViewResult)
    async RunmjBizAppsOrdersPaymentDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentDetailViewResult)
    async RunmjBizAppsOrdersPaymentDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentDetailViewResult)
    async RunmjBizAppsOrdersPaymentDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Details';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentDetail_, { nullable: true })
    async mjBizAppsOrdersPaymentDetail(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentDetail_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentDetails')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Details', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderHeader_])
    async mjBizAppsOrdersOrderHeaders_InitialPaymentDetailIDArray(@Root() mjbizappsorderspaymentdetail_: mjBizAppsOrdersPaymentDetail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderHeaders')} WHERE ${provider.QuoteIdentifier('InitialPaymentDetailID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentdetail_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersCustomerPaymentMethod_])
    async mjBizAppsOrdersCustomerPaymentMethods_PaymentDetailIDArray(@Root() mjbizappsorderspaymentdetail_: mjBizAppsOrdersPaymentDetail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Customer Payment Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwCustomerPaymentMethods')} WHERE ${provider.QuoteIdentifier('PaymentDetailID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Customer Payment Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentdetail_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Customer Payment Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentHeader_])
    async mjBizAppsOrdersPaymentHeaders_PaymentDetailIDArray(@Root() mjbizappsorderspaymentdetail_: mjBizAppsOrdersPaymentDetail_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentHeaders')} WHERE ${provider.QuoteIdentifier('PaymentDetailID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentdetail_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentDetail_)
    async CreatemjBizAppsOrdersPaymentDetail(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentDetailInput) input: CreatemjBizAppsOrdersPaymentDetailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Details', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentDetail_)
    async UpdatemjBizAppsOrdersPaymentDetail(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentDetailInput) input: UpdatemjBizAppsOrdersPaymentDetailInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Details', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentDetail_)
    async DeletemjBizAppsOrdersPaymentDetail(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Details', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Payment Headers
//****************************************************************************
@ObjectType({ description: `A money movement: a customer receipt or a reversal (refund/chargeback/bank return). Booked to accounting at capture; applied to orders via PaymentLine.` })
export class mjBizAppsOrdersPaymentHeader_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable payment identifier (PAY-{seq}). Unique.`}) 
    @MaxLength(40)
    PaymentNumber: string;
        
    @Field() 
    @MaxLength(36)
    ReceivingCompanyID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    BillToPersonID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the paying organization (D65).`}) 
    @MaxLength(36)
    BillToOrganizationID?: string;
        
    @Field({description: `Date the money moved (bank date, not entry date).`}) 
    PaymentDate: Date;
        
    @Field() 
    @MaxLength(36)
    PaymentTypeID: string;
        
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
    PaymentDetailID?: string;
        
    @Field({nullable: true, description: `Provider-side charge identifier (e.g. Stripe ch_...).`}) 
    @MaxLength(100)
    ProviderChargeID?: string;
        
    @Field({nullable: true, description: `Provider-side refund identifier when this payment is a provider refund.`}) 
    @MaxLength(100)
    ProviderRefundID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ReversesPaymentHeaderID?: string;
        
    @Field({nullable: true, description: `Reason this payment reverses another (required by validation when ReversesPaymentHeaderID is set).`}) 
    ReversalReason?: string;
        
    @Field({description: `Pending | Captured | Failed | Refunded | Disputed. Financial fields freeze at Captured (DB trigger); corrections via reversal payments.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `FK to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).`}) 
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
    @MaxLength(244)
    BillToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    BillToOrganization?: string;
        
    @Field() 
    @MaxLength(200)
    PaymentType: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentProvider?: string;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    JournalEntry?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootReversesPaymentHeaderID?: string;
        
    @Field(() => [mjBizAppsOrdersPaymentLine_])
    mjBizAppsOrdersPaymentLines_PaymentHeaderIDArray: mjBizAppsOrdersPaymentLine_[]; // Link to mjBizAppsOrdersPaymentLines
    
    @Field(() => [mjBizAppsOrdersSubscriptionEvent_])
    mjBizAppsOrdersSubscriptionEvents_RelatedPaymentIDArray: mjBizAppsOrdersSubscriptionEvent_[]; // Link to mjBizAppsOrdersSubscriptionEvents
    
    @Field(() => [mjBizAppsOrdersStoredValueTransaction_])
    mjBizAppsOrdersStoredValueTransactions_RelatedPaymentIDArray: mjBizAppsOrdersStoredValueTransaction_[]; // Link to mjBizAppsOrdersStoredValueTransactions
    
    @Field(() => [mjBizAppsOrdersPaymentHeader_])
    mjBizAppsOrdersPaymentHeaders_ReversesPaymentHeaderIDArray: mjBizAppsOrdersPaymentHeader_[]; // Link to mjBizAppsOrdersPaymentHeaders
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Headers
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentHeaderInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PaymentNumber?: string;

    @Field({ nullable: true })
    ReceivingCompanyID?: string;

    @Field({ nullable: true })
    BillToPersonID: string | null;

    @Field({ nullable: true })
    BillToOrganizationID: string | null;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field({ nullable: true })
    PaymentTypeID?: string;

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
    PaymentDetailID: string | null;

    @Field({ nullable: true })
    ProviderChargeID: string | null;

    @Field({ nullable: true })
    ProviderRefundID: string | null;

    @Field({ nullable: true })
    ReversesPaymentHeaderID: string | null;

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
// INPUT TYPE for MJ_BizApps_Orders: Payment Headers
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentHeaderInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PaymentNumber?: string;

    @Field({ nullable: true })
    ReceivingCompanyID?: string;

    @Field({ nullable: true })
    BillToPersonID?: string | null;

    @Field({ nullable: true })
    BillToOrganizationID?: string | null;

    @Field({ nullable: true })
    PaymentDate?: Date;

    @Field({ nullable: true })
    PaymentTypeID?: string;

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
    PaymentDetailID?: string | null;

    @Field({ nullable: true })
    ProviderChargeID?: string | null;

    @Field({ nullable: true })
    ProviderRefundID?: string | null;

    @Field({ nullable: true })
    ReversesPaymentHeaderID?: string | null;

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
// RESOLVER for MJ_BizApps_Orders: Payment Headers
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentHeaderViewResult {
    @Field(() => [mjBizAppsOrdersPaymentHeader_])
    Results: mjBizAppsOrdersPaymentHeader_[];

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

@Resolver(mjBizAppsOrdersPaymentHeader_)
export class mjBizAppsOrdersPaymentHeaderResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentHeaderViewResult)
    async RunmjBizAppsOrdersPaymentHeaderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentHeaderViewResult)
    async RunmjBizAppsOrdersPaymentHeaderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentHeaderViewResult)
    async RunmjBizAppsOrdersPaymentHeaderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Headers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentHeader_, { nullable: true })
    async mjBizAppsOrdersPaymentHeader(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentHeader_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentHeaders')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Headers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentLine_])
    async mjBizAppsOrdersPaymentLines_PaymentHeaderIDArray(@Root() mjbizappsorderspaymentheader_: mjBizAppsOrdersPaymentHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentLines')} WHERE ${provider.QuoteIdentifier('PaymentHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscriptionEvent_])
    async mjBizAppsOrdersSubscriptionEvents_RelatedPaymentIDArray(@Root() mjbizappsorderspaymentheader_: mjBizAppsOrdersPaymentHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionEvents')} WHERE ${provider.QuoteIdentifier('RelatedPaymentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Events', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersStoredValueTransaction_])
    async mjBizAppsOrdersStoredValueTransactions_RelatedPaymentIDArray(@Root() mjbizappsorderspaymentheader_: mjBizAppsOrdersPaymentHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Stored Value Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwStoredValueTransactions')} WHERE ${provider.QuoteIdentifier('RelatedPaymentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Stored Value Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Stored Value Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentHeader_])
    async mjBizAppsOrdersPaymentHeaders_ReversesPaymentHeaderIDArray(@Root() mjbizappsorderspaymentheader_: mjBizAppsOrdersPaymentHeader_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentHeaders')} WHERE ${provider.QuoteIdentifier('ReversesPaymentHeaderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentheader_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentHeader_)
    async CreatemjBizAppsOrdersPaymentHeader(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentHeaderInput) input: CreatemjBizAppsOrdersPaymentHeaderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Headers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentHeader_)
    async UpdatemjBizAppsOrdersPaymentHeader(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentHeaderInput) input: UpdatemjBizAppsOrdersPaymentHeaderInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Headers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentHeader_)
    async DeletemjBizAppsOrdersPaymentHeader(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Headers', key, options, provider, userPayload, pubSub);
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
    OrderHeaderID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    BillToPersonID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the organization being collected from (D65).`}) 
    @MaxLength(36)
    BillToOrganizationID?: string;
        
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
        
    @Field({nullable: true}) 
    @MaxLength(244)
    BillToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    BillToOrganization?: string;
        
    @Field(() => [mjBizAppsOrdersPaymentHeader_])
    mjBizAppsOrdersPaymentHeaders_PaymentIntentIDArray: mjBizAppsOrdersPaymentHeader_[]; // Link to mjBizAppsOrdersPaymentHeaders
    
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
    OrderHeaderID: string | null;

    @Field({ nullable: true })
    BillToPersonID: string | null;

    @Field({ nullable: true })
    BillToOrganizationID: string | null;

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
    OrderHeaderID?: string | null;

    @Field({ nullable: true })
    BillToPersonID?: string | null;

    @Field({ nullable: true })
    BillToOrganizationID?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentHeader_])
    async mjBizAppsOrdersPaymentHeaders_PaymentIntentIDArray(@Root() mjbizappsorderspaymentintent_: mjBizAppsOrdersPaymentIntent_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentHeaders')} WHERE ${provider.QuoteIdentifier('PaymentIntentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentintent_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Headers', rows, this.GetUserFromPayload(userPayload));
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
    PaymentHeaderID: string;
        
    @Field() 
    @MaxLength(36)
    OrderHeaderID: string;
        
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
        
    @Field({nullable: true, description: `UTC timestamp when this allocation's journal entries were written; NULL until booked. Not a JournalEntryID: one payment line produces one entry PER COMPANY owning a line on the order it settles, so there is no single entry to point at — the entries are found via accounting's provenance pair (LinkedEntityID = Payment Lines, LinkedRecordID = this row). Idempotency key: checked before booking so a re-save never doubles the cash leg.`}) 
    BookedAt?: Date;
        
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
    PaymentHeaderID?: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    OrderLineID: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    AllocatedAt?: Date;

    @Field({ nullable: true })
    AllocatedByUserID: string | null;

    @Field({ nullable: true })
    BookedAt: Date | null;

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
    PaymentHeaderID?: string;

    @Field({ nullable: true })
    OrderHeaderID?: string;

    @Field({ nullable: true })
    OrderLineID?: string | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    AllocatedAt?: Date;

    @Field({ nullable: true })
    AllocatedByUserID?: string | null;

    @Field({ nullable: true })
    BookedAt?: Date | null;

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
// ENTITY CLASS for MJ_BizApps_Orders: Payment Provider Types
//****************************************************************************
@ObjectType()
export class mjBizAppsOrdersPaymentProviderType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DriverClass?: string;
        
    @Field(() => Boolean) 
    SupportsTokenization: boolean;
        
    @Field(() => Boolean) 
    SupportsRefund: boolean;
        
    @Field(() => Boolean) 
    SupportsWebhooks: boolean;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersPaymentProvider_])
    mjBizAppsOrdersPaymentProviders_PaymentProviderTypeIDArray: mjBizAppsOrdersPaymentProvider_[]; // Link to mjBizAppsOrdersPaymentProviders
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Provider Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentProviderTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    DriverClass: string | null;

    @Field(() => Boolean, { nullable: true })
    SupportsTokenization?: boolean;

    @Field(() => Boolean, { nullable: true })
    SupportsRefund?: boolean;

    @Field(() => Boolean, { nullable: true })
    SupportsWebhooks?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Provider Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentProviderTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    DriverClass?: string | null;

    @Field(() => Boolean, { nullable: true })
    SupportsTokenization?: boolean;

    @Field(() => Boolean, { nullable: true })
    SupportsRefund?: boolean;

    @Field(() => Boolean, { nullable: true })
    SupportsWebhooks?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Provider Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentProviderTypeViewResult {
    @Field(() => [mjBizAppsOrdersPaymentProviderType_])
    Results: mjBizAppsOrdersPaymentProviderType_[];

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

@Resolver(mjBizAppsOrdersPaymentProviderType_)
export class mjBizAppsOrdersPaymentProviderTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentProviderTypeViewResult)
    async RunmjBizAppsOrdersPaymentProviderTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentProviderTypeViewResult)
    async RunmjBizAppsOrdersPaymentProviderTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentProviderTypeViewResult)
    async RunmjBizAppsOrdersPaymentProviderTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Provider Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentProviderType_, { nullable: true })
    async mjBizAppsOrdersPaymentProviderType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentProviderType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Provider Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentProviderTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Provider Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Provider Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentProvider_])
    async mjBizAppsOrdersPaymentProviders_PaymentProviderTypeIDArray(@Root() mjbizappsorderspaymentprovidertype_: mjBizAppsOrdersPaymentProviderType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Providers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentProviders')} WHERE ${provider.QuoteIdentifier('PaymentProviderTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Providers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovidertype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Providers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentProviderType_)
    async CreatemjBizAppsOrdersPaymentProviderType(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentProviderTypeInput) input: CreatemjBizAppsOrdersPaymentProviderTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Provider Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentProviderType_)
    async UpdatemjBizAppsOrdersPaymentProviderType(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentProviderTypeInput) input: UpdatemjBizAppsOrdersPaymentProviderTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Provider Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentProviderType_)
    async DeletemjBizAppsOrdersPaymentProviderType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Provider Types', key, options, provider, userPayload, pubSub);
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
        
    @Field() 
    @MaxLength(36)
    PaymentProviderTypeID: string;
        
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
    @MaxLength(200)
    PaymentProviderType: string;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field(() => [mjBizAppsOrdersPaymentDetail_])
    mjBizAppsOrdersPaymentDetails_PaymentProviderIDArray: mjBizAppsOrdersPaymentDetail_[]; // Link to mjBizAppsOrdersPaymentDetails
    
    @Field(() => [mjBizAppsOrdersPaymentHeader_])
    mjBizAppsOrdersPaymentHeaders_PaymentProviderIDArray: mjBizAppsOrdersPaymentHeader_[]; // Link to mjBizAppsOrdersPaymentHeaders
    
    @Field(() => [mjBizAppsOrdersSubscription_])
    mjBizAppsOrdersSubscriptions_PaymentProviderIDArray: mjBizAppsOrdersSubscription_[]; // Link to mjBizAppsOrdersSubscriptions
    
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
    PaymentProviderTypeID?: string;

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
    PaymentProviderTypeID?: string;

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
    
    @FieldResolver(() => [mjBizAppsOrdersPaymentDetail_])
    async mjBizAppsOrdersPaymentDetails_PaymentProviderIDArray(@Root() mjbizappsorderspaymentprovider_: mjBizAppsOrdersPaymentProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentDetails')} WHERE ${provider.QuoteIdentifier('PaymentProviderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovider_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentHeader_])
    async mjBizAppsOrdersPaymentHeaders_PaymentProviderIDArray(@Root() mjbizappsorderspaymentprovider_: mjBizAppsOrdersPaymentProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentHeaders')} WHERE ${provider.QuoteIdentifier('PaymentProviderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovider_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscription_])
    async mjBizAppsOrdersSubscriptions_PaymentProviderIDArray(@Root() mjbizappsorderspaymentprovider_: mjBizAppsOrdersPaymentProvider_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('PaymentProviderID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymentprovider_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows, this.GetUserFromPayload(userPayload));
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
        
    @Field(() => [mjBizAppsOrdersOrderHeader_])
    mjBizAppsOrdersOrderHeaders_PaymentTermsTypeIDArray: mjBizAppsOrdersOrderHeader_[]; // Link to mjBizAppsOrdersOrderHeaders
    
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
    
    @FieldResolver(() => [mjBizAppsOrdersOrderHeader_])
    async mjBizAppsOrdersOrderHeaders_PaymentTermsTypeIDArray(@Root() mjbizappsorderspaymenttermstype_: mjBizAppsOrdersPaymentTermsType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderHeaders')} WHERE ${provider.QuoteIdentifier('PaymentTermsTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymenttermstype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Headers', rows, this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for MJ_BizApps_Orders: Payment Types
//****************************************************************************
@ObjectType()
export class mjBizAppsOrdersPaymentType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Boolean) 
    IsReversal: boolean;
        
    @Field(() => Boolean) 
    RequiresProvider: boolean;
        
    @Field(() => Boolean) 
    RequiresInstrument: boolean;
        
    @Field(() => Boolean) 
    RequiresReference: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    DetailExtensionEntity?: string;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersOrderHeader_])
    mjBizAppsOrdersOrderHeaders_InitialPaymentTypeIDArray: mjBizAppsOrdersOrderHeader_[]; // Link to mjBizAppsOrdersOrderHeaders
    
    @Field(() => [mjBizAppsOrdersPaymentHeader_])
    mjBizAppsOrdersPaymentHeaders_PaymentTypeIDArray: mjBizAppsOrdersPaymentHeader_[]; // Link to mjBizAppsOrdersPaymentHeaders
    
    @Field(() => [mjBizAppsOrdersPaymentDetail_])
    mjBizAppsOrdersPaymentDetails_PaymentTypeIDArray: mjBizAppsOrdersPaymentDetail_[]; // Link to mjBizAppsOrdersPaymentDetails
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPaymentTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    IsReversal?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresProvider?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresInstrument?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresReference?: boolean;

    @Field({ nullable: true })
    DetailExtensionEntity: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Payment Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPaymentTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsReversal?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresProvider?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresInstrument?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresReference?: boolean;

    @Field({ nullable: true })
    DetailExtensionEntity?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Payment Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPaymentTypeViewResult {
    @Field(() => [mjBizAppsOrdersPaymentType_])
    Results: mjBizAppsOrdersPaymentType_[];

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

@Resolver(mjBizAppsOrdersPaymentType_)
export class mjBizAppsOrdersPaymentTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPaymentTypeViewResult)
    async RunmjBizAppsOrdersPaymentTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentTypeViewResult)
    async RunmjBizAppsOrdersPaymentTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPaymentTypeViewResult)
    async RunmjBizAppsOrdersPaymentTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Payment Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPaymentType_, { nullable: true })
    async mjBizAppsOrdersPaymentType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPaymentType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderHeader_])
    async mjBizAppsOrdersOrderHeaders_InitialPaymentTypeIDArray(@Root() mjbizappsorderspaymenttype_: mjBizAppsOrdersPaymentType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderHeaders')} WHERE ${provider.QuoteIdentifier('InitialPaymentTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymenttype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentHeader_])
    async mjBizAppsOrdersPaymentHeaders_PaymentTypeIDArray(@Root() mjbizappsorderspaymenttype_: mjBizAppsOrdersPaymentType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Headers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentHeaders')} WHERE ${provider.QuoteIdentifier('PaymentTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Headers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymenttype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Headers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentDetail_])
    async mjBizAppsOrdersPaymentDetails_PaymentTypeIDArray(@Root() mjbizappsorderspaymenttype_: mjBizAppsOrdersPaymentType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentDetails')} WHERE ${provider.QuoteIdentifier('PaymentTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspaymenttype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentType_)
    async CreatemjBizAppsOrdersPaymentType(
        @Arg('input', () => CreatemjBizAppsOrdersPaymentTypeInput) input: CreatemjBizAppsOrdersPaymentTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Payment Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPaymentType_)
    async UpdatemjBizAppsOrdersPaymentType(
        @Arg('input', () => UpdatemjBizAppsOrdersPaymentTypeInput) input: UpdatemjBizAppsOrdersPaymentTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Payment Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPaymentType_)
    async DeletemjBizAppsOrdersPaymentType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Payment Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Price List Assignments
//****************************************************************************
@ObjectType({ description: `Which price list a customer gets - the link nothing in the schema previously provided. PriceListID existed only on ProductPrice, so the schema could say what a product cost ON a list but never WHICH list applied to an order. A customer with no assignment resolves to the product base price, so no default-assignment row is needed.` })
export class mjBizAppsOrdersPriceListAssignment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PriceListID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field(() => Int, {description: `Breaks the tie when a person's own assignment and their organization's both apply. Higher wins.`}) 
    Priority: number;
        
    @Field({nullable: true}) 
    StartedAt?: Date;
        
    @Field({nullable: true}) 
    EndedAt?: Date;
        
    @Field() 
    @MaxLength(10)
    Status: string;
        
    @Field({nullable: true}) 
    Comments?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    PriceList: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    Person?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Price List Assignments
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPriceListAssignmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PriceListID?: string;

    @Field({ nullable: true })
    OrganizationID: string | null;

    @Field({ nullable: true })
    PersonID: string | null;

    @Field(() => Int, { nullable: true })
    Priority?: number;

    @Field({ nullable: true })
    StartedAt: Date | null;

    @Field({ nullable: true })
    EndedAt: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Comments: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Price List Assignments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPriceListAssignmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PriceListID?: string;

    @Field({ nullable: true })
    OrganizationID?: string | null;

    @Field({ nullable: true })
    PersonID?: string | null;

    @Field(() => Int, { nullable: true })
    Priority?: number;

    @Field({ nullable: true })
    StartedAt?: Date | null;

    @Field({ nullable: true })
    EndedAt?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Comments?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Price List Assignments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPriceListAssignmentViewResult {
    @Field(() => [mjBizAppsOrdersPriceListAssignment_])
    Results: mjBizAppsOrdersPriceListAssignment_[];

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

@Resolver(mjBizAppsOrdersPriceListAssignment_)
export class mjBizAppsOrdersPriceListAssignmentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPriceListAssignmentViewResult)
    async RunmjBizAppsOrdersPriceListAssignmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPriceListAssignmentViewResult)
    async RunmjBizAppsOrdersPriceListAssignmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPriceListAssignmentViewResult)
    async RunmjBizAppsOrdersPriceListAssignmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Price List Assignments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPriceListAssignment_, { nullable: true })
    async mjBizAppsOrdersPriceListAssignment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPriceListAssignment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Price List Assignments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPriceListAssignments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Price List Assignments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Price List Assignments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersPriceListAssignment_)
    async CreatemjBizAppsOrdersPriceListAssignment(
        @Arg('input', () => CreatemjBizAppsOrdersPriceListAssignmentInput) input: CreatemjBizAppsOrdersPriceListAssignmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Price List Assignments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPriceListAssignment_)
    async UpdatemjBizAppsOrdersPriceListAssignment(
        @Arg('input', () => UpdatemjBizAppsOrdersPriceListAssignmentInput) input: UpdatemjBizAppsOrdersPriceListAssignmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Price List Assignments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPriceListAssignment_)
    async DeletemjBizAppsOrdersPriceListAssignment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Price List Assignments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Price Lists
//****************************************************************************
@ObjectType({ description: `Pricing segmentation container (BO-D33): region/channel/customer-tier scope, effective-dated. Currency column deferred with FX (MOD-4).` })
export class mjBizAppsOrdersPriceList_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Stable machine code. Unique.`}) 
    @MaxLength(40)
    Code: string;
        
    @Field({description: `Display name.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true, description: `List validity start.`}) 
    EffectiveFrom?: Date;
        
    @Field({nullable: true, description: `List validity end.`}) 
    EffectiveTo?: Date;
        
    @Field({description: `Active | Inactive. Deliberately NO CompanyID on this table: every price in a list points at a Product that already carries its company, so a column here would only be an administrative guardrail - and it would force a group-wide member rate to be duplicated per company.`}) 
    @MaxLength(10)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersProductPrice_])
    mjBizAppsOrdersProductPrices_PriceListIDArray: mjBizAppsOrdersProductPrice_[]; // Link to mjBizAppsOrdersProductPrices
    
    @Field(() => [mjBizAppsOrdersPriceListAssignment_])
    mjBizAppsOrdersPriceListAssignments_PriceListIDArray: mjBizAppsOrdersPriceListAssignment_[]; // Link to mjBizAppsOrdersPriceListAssignments
    
    @Field(() => [mjBizAppsOrdersOrderCompanyPolicy_])
    mjBizAppsOrdersOrderCompanyPolicies_DefaultPriceListIDArray: mjBizAppsOrdersOrderCompanyPolicy_[]; // Link to mjBizAppsOrdersOrderCompanyPolicies
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Price Lists
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPriceListInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    EffectiveFrom: Date | null;

    @Field({ nullable: true })
    EffectiveTo: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Price Lists
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPriceListInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    EffectiveFrom?: Date | null;

    @Field({ nullable: true })
    EffectiveTo?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Price Lists
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPriceListViewResult {
    @Field(() => [mjBizAppsOrdersPriceList_])
    Results: mjBizAppsOrdersPriceList_[];

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

@Resolver(mjBizAppsOrdersPriceList_)
export class mjBizAppsOrdersPriceListResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPriceListViewResult)
    async RunmjBizAppsOrdersPriceListViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPriceListViewResult)
    async RunmjBizAppsOrdersPriceListViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPriceListViewResult)
    async RunmjBizAppsOrdersPriceListDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Price Lists';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPriceList_, { nullable: true })
    async mjBizAppsOrdersPriceList(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPriceList_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Price Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPriceLists')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Price Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Price Lists', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersProductPrice_])
    async mjBizAppsOrdersProductPrices_PriceListIDArray(@Root() mjbizappsorderspricelist_: mjBizAppsOrdersPriceList_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Prices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductPrices')} WHERE ${provider.QuoteIdentifier('PriceListID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Prices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspricelist_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Prices', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPriceListAssignment_])
    async mjBizAppsOrdersPriceListAssignments_PriceListIDArray(@Root() mjbizappsorderspricelist_: mjBizAppsOrdersPriceList_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Price List Assignments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPriceListAssignments')} WHERE ${provider.QuoteIdentifier('PriceListID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Price List Assignments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspricelist_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Price List Assignments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderCompanyPolicy_])
    async mjBizAppsOrdersOrderCompanyPolicies_DefaultPriceListIDArray(@Root() mjbizappsorderspricelist_: mjBizAppsOrdersPriceList_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Company Policies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderCompanyPolicies')} WHERE ${provider.QuoteIdentifier('DefaultPriceListID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Company Policies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspricelist_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Company Policies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPriceList_)
    async CreatemjBizAppsOrdersPriceList(
        @Arg('input', () => CreatemjBizAppsOrdersPriceListInput) input: CreatemjBizAppsOrdersPriceListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Price Lists', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPriceList_)
    async UpdatemjBizAppsOrdersPriceList(
        @Arg('input', () => UpdatemjBizAppsOrdersPriceListInput) input: UpdatemjBizAppsOrdersPriceListInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Price Lists', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPriceList_)
    async DeletemjBizAppsOrdersPriceList(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Price Lists', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Price Tiers
//****************************************************************************
@ObjectType({ description: `Volume/quantity break under a Tiered or Volume ProductPrice (BO-D33).` })
export class mjBizAppsOrdersPriceTier_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ProductPriceID: string;
        
    @Field(() => Float, {description: `Tier lower bound (inclusive).`}) 
    MinQuantity: number;
        
    @Field(() => Float, {nullable: true, description: `Tier upper bound. NULL = unbounded top tier.`}) 
    MaxQuantity?: number;
        
    @Field(() => Float, {description: `Per-unit (or flat) price within this tier.`}) 
    Amount: number;
        
    @Field(() => Int, {description: `Display order of tiers.`}) 
    SortOrder: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Price Tiers
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPriceTierInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProductPriceID?: string;

    @Field(() => Float, { nullable: true })
    MinQuantity?: number;

    @Field(() => Float, { nullable: true })
    MaxQuantity: number | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Price Tiers
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPriceTierInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProductPriceID?: string;

    @Field(() => Float, { nullable: true })
    MinQuantity?: number;

    @Field(() => Float, { nullable: true })
    MaxQuantity?: number | null;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Price Tiers
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPriceTierViewResult {
    @Field(() => [mjBizAppsOrdersPriceTier_])
    Results: mjBizAppsOrdersPriceTier_[];

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

@Resolver(mjBizAppsOrdersPriceTier_)
export class mjBizAppsOrdersPriceTierResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPriceTierViewResult)
    async RunmjBizAppsOrdersPriceTierViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPriceTierViewResult)
    async RunmjBizAppsOrdersPriceTierViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPriceTierViewResult)
    async RunmjBizAppsOrdersPriceTierDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Price Tiers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPriceTier_, { nullable: true })
    async mjBizAppsOrdersPriceTier(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPriceTier_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Price Tiers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPriceTiers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Price Tiers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Price Tiers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersPriceTier_)
    async CreatemjBizAppsOrdersPriceTier(
        @Arg('input', () => CreatemjBizAppsOrdersPriceTierInput) input: CreatemjBizAppsOrdersPriceTierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Price Tiers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPriceTier_)
    async UpdatemjBizAppsOrdersPriceTier(
        @Arg('input', () => UpdatemjBizAppsOrdersPriceTierInput) input: UpdatemjBizAppsOrdersPriceTierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Price Tiers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPriceTier_)
    async DeletemjBizAppsOrdersPriceTier(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Price Tiers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Product Bundle Items
//****************************************************************************
@ObjectType({ description: `Component membership of a bundle product (BO-D32/D41): one structure powering bundle-line ordering and fast-path expansion.` })
export class mjBizAppsOrdersProductBundleItem_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    BundleProductID: string;
        
    @Field() 
    @MaxLength(36)
    ComponentProductID: string;
        
    @Field(() => Float, {description: `Quantity of the component per one bundle.`}) 
    Quantity: number;
        
    @Field({description: `Bundled (fixed bundle price, SSP-allocated) | SumOfParts (components price individually).`}) 
    @MaxLength(20)
    PricingMode: string;
        
    @Field(() => Int, {description: `Display order of components within the bundle.`}) 
    SortOrder: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    BundleProduct: string;
        
    @Field() 
    @MaxLength(200)
    ComponentProduct: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Bundle Items
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductBundleItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BundleProductID?: string;

    @Field({ nullable: true })
    ComponentProductID?: string;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field({ nullable: true })
    PricingMode?: string;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Bundle Items
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductBundleItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BundleProductID?: string;

    @Field({ nullable: true })
    ComponentProductID?: string;

    @Field(() => Float, { nullable: true })
    Quantity?: number;

    @Field({ nullable: true })
    PricingMode?: string;

    @Field(() => Int, { nullable: true })
    SortOrder?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Product Bundle Items
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductBundleItemViewResult {
    @Field(() => [mjBizAppsOrdersProductBundleItem_])
    Results: mjBizAppsOrdersProductBundleItem_[];

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

@Resolver(mjBizAppsOrdersProductBundleItem_)
export class mjBizAppsOrdersProductBundleItemResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductBundleItemViewResult)
    async RunmjBizAppsOrdersProductBundleItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductBundleItemViewResult)
    async RunmjBizAppsOrdersProductBundleItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductBundleItemViewResult)
    async RunmjBizAppsOrdersProductBundleItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Product Bundle Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProductBundleItem_, { nullable: true })
    async mjBizAppsOrdersProductBundleItem(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProductBundleItem_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Bundle Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductBundleItems')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Bundle Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Bundle Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersProductBundleItem_)
    async CreatemjBizAppsOrdersProductBundleItem(
        @Arg('input', () => CreatemjBizAppsOrdersProductBundleItemInput) input: CreatemjBizAppsOrdersProductBundleItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Product Bundle Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProductBundleItem_)
    async UpdatemjBizAppsOrdersProductBundleItem(
        @Arg('input', () => UpdatemjBizAppsOrdersProductBundleItemInput) input: UpdatemjBizAppsOrdersProductBundleItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Product Bundle Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProductBundleItem_)
    async DeletemjBizAppsOrdersProductBundleItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Product Bundle Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Product Categories
//****************************************************************************
@ObjectType({ description: `PER-COMPANY hierarchical grouping of products (D7): each company owns its own category tree; identical names across companies display-collapse in the UI. The account resolver walks the ParentProductCategoryID tree upward within the company.` })
export class mjBizAppsOrdersProductCategory_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The company that owns this category tree (D7). No shared/global categories. FK to __mj.Company.`}) 
    @MaxLength(36)
    CompanyID: string;
        
    @Field({nullable: true, description: `Stable machine code for the category. Unique when present.`}) 
    @MaxLength(40)
    Code?: string;
        
    @Field({description: `Display name of the category.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentProductCategoryID?: string;
        
    @Field({nullable: true, description: `Optional description of the category.`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `Whether this category is active and selectable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ParentProductCategory?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentProductCategoryID?: string;
        
    @Field(() => [mjBizAppsOrdersPromotionTarget_])
    mjBizAppsOrdersPromotionTargets_ProductCategoryIDArray: mjBizAppsOrdersPromotionTarget_[]; // Link to mjBizAppsOrdersPromotionTargets
    
    @Field(() => [mjBizAppsOrdersProduct_])
    mjBizAppsOrdersProducts_ProductCategoryIDArray: mjBizAppsOrdersProduct_[]; // Link to mjBizAppsOrdersProducts
    
    @Field(() => [mjBizAppsOrdersProductCategory_])
    mjBizAppsOrdersProductCategories_ParentProductCategoryIDArray: mjBizAppsOrdersProductCategory_[]; // Link to mjBizAppsOrdersProductCategories
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Categories
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Code: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ParentProductCategoryID: string | null;

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
    CompanyID?: string;

    @Field({ nullable: true })
    Code?: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ParentProductCategoryID?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersPromotionTarget_])
    async mjBizAppsOrdersPromotionTargets_ProductCategoryIDArray(@Root() mjbizappsordersproductcategory_: mjBizAppsOrdersProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Targets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionTargets')} WHERE ${provider.QuoteIdentifier('ProductCategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Targets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproductcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Targets', rows, this.GetUserFromPayload(userPayload));
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
    async mjBizAppsOrdersProductCategories_ParentProductCategoryIDArray(@Root() mjbizappsordersproductcategory_: mjBizAppsOrdersProductCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductCategories')} WHERE ${provider.QuoteIdentifier('ParentProductCategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Categories', userPayload, EntityPermissionType.Read, 'AND');
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
// ENTITY CLASS for MJ_BizApps_Orders: Product Entitlements
//****************************************************************************
@ObjectType({ description: `The DEFINITION of what purchasing a product grants (BO-D34): feature, access level, or resource quantity. EntitlementGrant is the per-purchase instance.` })
export class mjBizAppsOrdersProductEntitlement_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field({description: `Feature | AccessLevel | ResourceQuantity | Custom.`}) 
    @MaxLength(40)
    EntitlementType: string;
        
    @Field({description: `Machine key consumed by downstream apps (unique per product).`}) 
    @MaxLength(80)
    Code: string;
        
    @Field({nullable: true, description: `Display name of the entitlement.`}) 
    @MaxLength(200)
    Name?: string;
        
    @Field(() => Float, {nullable: true, description: `Granted quantity for ResourceQuantity entitlements (e.g. 100 GB, 5 seats).`}) 
    Quantity?: number;
        
    @Field({nullable: true, description: `Unit for Quantity (GB, seats, hours, ...).`}) 
    @MaxLength(40)
    UnitOfMeasure?: string;
        
    @Field(() => Boolean, {description: `Whether this entitlement is currently granted by new purchases.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Product: string;
        
    @Field(() => [mjBizAppsOrdersEntitlementGrant_])
    mjBizAppsOrdersEntitlementGrants_ProductEntitlementIDArray: mjBizAppsOrdersEntitlementGrant_[]; // Link to mjBizAppsOrdersEntitlementGrants
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Entitlements
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductEntitlementInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    EntitlementType?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name: string | null;

    @Field(() => Float, { nullable: true })
    Quantity: number | null;

    @Field({ nullable: true })
    UnitOfMeasure: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Entitlements
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductEntitlementInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    EntitlementType?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string | null;

    @Field(() => Float, { nullable: true })
    Quantity?: number | null;

    @Field({ nullable: true })
    UnitOfMeasure?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Product Entitlements
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductEntitlementViewResult {
    @Field(() => [mjBizAppsOrdersProductEntitlement_])
    Results: mjBizAppsOrdersProductEntitlement_[];

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

@Resolver(mjBizAppsOrdersProductEntitlement_)
export class mjBizAppsOrdersProductEntitlementResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductEntitlementViewResult)
    async RunmjBizAppsOrdersProductEntitlementViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductEntitlementViewResult)
    async RunmjBizAppsOrdersProductEntitlementViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductEntitlementViewResult)
    async RunmjBizAppsOrdersProductEntitlementDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Product Entitlements';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProductEntitlement_, { nullable: true })
    async mjBizAppsOrdersProductEntitlement(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProductEntitlement_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Entitlements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductEntitlements')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Entitlements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Entitlements', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersEntitlementGrant_])
    async mjBizAppsOrdersEntitlementGrants_ProductEntitlementIDArray(@Root() mjbizappsordersproductentitlement_: mjBizAppsOrdersProductEntitlement_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Entitlement Grants', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEntitlementGrants')} WHERE ${provider.QuoteIdentifier('ProductEntitlementID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Entitlement Grants', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproductentitlement_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Entitlement Grants', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersProductEntitlement_)
    async CreatemjBizAppsOrdersProductEntitlement(
        @Arg('input', () => CreatemjBizAppsOrdersProductEntitlementInput) input: CreatemjBizAppsOrdersProductEntitlementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Product Entitlements', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProductEntitlement_)
    async UpdatemjBizAppsOrdersProductEntitlement(
        @Arg('input', () => UpdatemjBizAppsOrdersProductEntitlementInput) input: UpdatemjBizAppsOrdersProductEntitlementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Product Entitlements', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProductEntitlement_)
    async DeletemjBizAppsOrdersProductEntitlement(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Product Entitlements', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Product Performance Obligations
//****************************************************************************
@ObjectType({ description: `ASC 606 performance obligation (BO-D35): one or more per product; SSP drives bundle allocation. Fields now; the allocation engine is deferred. GL routing via GLAccountLink (MOD-2).` })
export class mjBizAppsOrdersProductPerformanceObligation_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field({nullable: true, description: `Display name of the obligation.`}) 
    @MaxLength(200)
    Name?: string;
        
    @Field() 
    @MaxLength(36)
    RevenueRecognitionTypeID: string;
        
    @Field(() => Float, {description: `Standalone selling price used for relative-SSP allocation across obligations.`}) 
    StandaloneSellingPrice: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Product: string;
        
    @Field() 
    @MaxLength(200)
    RevenueRecognitionType: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Performance Obligations
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductPerformanceObligationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field(() => Float, { nullable: true })
    StandaloneSellingPrice?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Performance Obligations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductPerformanceObligationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field(() => Float, { nullable: true })
    StandaloneSellingPrice?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Product Performance Obligations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductPerformanceObligationViewResult {
    @Field(() => [mjBizAppsOrdersProductPerformanceObligation_])
    Results: mjBizAppsOrdersProductPerformanceObligation_[];

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

@Resolver(mjBizAppsOrdersProductPerformanceObligation_)
export class mjBizAppsOrdersProductPerformanceObligationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductPerformanceObligationViewResult)
    async RunmjBizAppsOrdersProductPerformanceObligationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductPerformanceObligationViewResult)
    async RunmjBizAppsOrdersProductPerformanceObligationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductPerformanceObligationViewResult)
    async RunmjBizAppsOrdersProductPerformanceObligationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Product Performance Obligations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProductPerformanceObligation_, { nullable: true })
    async mjBizAppsOrdersProductPerformanceObligation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProductPerformanceObligation_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Performance Obligations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductPerformanceObligations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Performance Obligations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Performance Obligations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersProductPerformanceObligation_)
    async CreatemjBizAppsOrdersProductPerformanceObligation(
        @Arg('input', () => CreatemjBizAppsOrdersProductPerformanceObligationInput) input: CreatemjBizAppsOrdersProductPerformanceObligationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Product Performance Obligations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProductPerformanceObligation_)
    async UpdatemjBizAppsOrdersProductPerformanceObligation(
        @Arg('input', () => UpdatemjBizAppsOrdersProductPerformanceObligationInput) input: UpdatemjBizAppsOrdersProductPerformanceObligationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Product Performance Obligations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProductPerformanceObligation_)
    async DeletemjBizAppsOrdersProductPerformanceObligation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Product Performance Obligations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Product Prices
//****************************************************************************
@ObjectType({ description: `ONE ROW IS ONE PRICE RULE. Several rows per product and list express quantity bands, seasons, promotional windows and time-of-day rates; Priority disambiguates. The row carries both the applicability predicates and the outcome, so there is no separate rule table to keep in step. Ties on Priority are refused when WRITTEN, not resolved when read - an arbitrary winner between two applicable rules is stable in test and liable to flip in production.` })
export class mjBizAppsOrdersProductPrice_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field({nullable: true, description: `The list this rule belongs to. NULL means the product's BASE price, which is what a customer with no price-list assignment resolves to.`}) 
    @MaxLength(36)
    PriceListID?: string;
        
    @Field({description: `Flat | PerUnit | Tiered | Volume | Package | Usage.`}) 
    @MaxLength(20)
    PricingModel: string;
        
    @Field({description: `Standard | Setup | Recurring | Overage.`}) 
    @MaxLength(20)
    FeeType: string;
        
    @Field(() => Float, {description: `Base/flat amount; tier detail lives in PriceTier.`}) 
    Amount: number;
        
    @Field({nullable: true, description: `Pricing unit (each, month, hour, GB, seat, ...).`}) 
    @MaxLength(40)
    UnitOfMeasure?: string;
        
    @Field(() => Float, {nullable: true, description: `Package model only: this many units for Amount (twelve for the price of ten).`}) 
    PackageQuantity?: number;
        
    @Field(() => Float, {nullable: true, description: `Minimum quantity this price applies to.`}) 
    MinQuantity?: number;
        
    @Field(() => Float, {nullable: true, description: `Maximum quantity this price applies to.`}) 
    MaxQuantity?: number;
        
    @Field({description: `Price validity start.`}) 
    EffectiveFrom: Date;
        
    @Field({nullable: true, description: `Price validity end.`}) 
    EffectiveTo?: Date;
        
    @Field({nullable: true, description: `Comma-separated month numbers this rule applies in, e.g. '11,12' for a winter rate. Evaluated in TypeScript and never filtered in SQL, which is why it is a string rather than a child table.`}) 
    @MaxLength(40)
    RecurrenceMonths?: string;
        
    @Field({nullable: true, description: `Comma-separated ISO day numbers (Monday=1) this rule applies on.`}) 
    @MaxLength(20)
    RecurrenceDaysOfWeek?: string;
        
    @Field(() => Int, {nullable: true, description: `Start of a day-of-month window, for rules like 'the first week of any month'.`}) 
    RecurrenceDayOfMonthMin?: number;
        
    @Field(() => Int, {nullable: true, description: `End of the day-of-month window.`}) 
    RecurrenceDayOfMonthMax?: number;
        
    @Field({nullable: true, description: `Start of a daily window, in the OWNING COMPANY's timezone. Left unstated, a happy-hour rate would run at the wrong hour for every entity but one.`}) 
    TimeOfDayStart?: Date;
        
    @Field({nullable: true, description: `End of the daily window, in the owning company's timezone.`}) 
    TimeOfDayEnd?: Date;
        
    @Field(() => Int, {description: `Disambiguates overlapping rules; highest wins. Two applicable rules sharing a priority are refused at write time.`}) 
    Priority: number;
        
    @Field({description: `Active | Inactive. Only Active rules resolve.`}) 
    @MaxLength(10)
    Status: string;
        
    @Field({nullable: true, description: `Why this rule exists, in words - the thing nobody can reconstruct from the predicates a year later.`}) 
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
    PriceList?: string;
        
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_ProductPriceIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
    @Field(() => [mjBizAppsOrdersPriceTier_])
    mjBizAppsOrdersPriceTiers_ProductPriceIDArray: mjBizAppsOrdersPriceTier_[]; // Link to mjBizAppsOrdersPriceTiers
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Prices
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersProductPriceInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    PriceListID: string | null;

    @Field({ nullable: true })
    PricingModel?: string;

    @Field({ nullable: true })
    FeeType?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    UnitOfMeasure: string | null;

    @Field(() => Float, { nullable: true })
    PackageQuantity: number | null;

    @Field(() => Float, { nullable: true })
    MinQuantity: number | null;

    @Field(() => Float, { nullable: true })
    MaxQuantity: number | null;

    @Field({ nullable: true })
    EffectiveFrom?: Date;

    @Field({ nullable: true })
    EffectiveTo: Date | null;

    @Field({ nullable: true })
    RecurrenceMonths: string | null;

    @Field({ nullable: true })
    RecurrenceDaysOfWeek: string | null;

    @Field(() => Int, { nullable: true })
    RecurrenceDayOfMonthMin: number | null;

    @Field(() => Int, { nullable: true })
    RecurrenceDayOfMonthMax: number | null;

    @Field({ nullable: true })
    TimeOfDayStart: Date | null;

    @Field({ nullable: true })
    TimeOfDayEnd: Date | null;

    @Field(() => Int, { nullable: true })
    Priority?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Product Prices
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersProductPriceInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    PriceListID?: string | null;

    @Field({ nullable: true })
    PricingModel?: string;

    @Field({ nullable: true })
    FeeType?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    UnitOfMeasure?: string | null;

    @Field(() => Float, { nullable: true })
    PackageQuantity?: number | null;

    @Field(() => Float, { nullable: true })
    MinQuantity?: number | null;

    @Field(() => Float, { nullable: true })
    MaxQuantity?: number | null;

    @Field({ nullable: true })
    EffectiveFrom?: Date;

    @Field({ nullable: true })
    EffectiveTo?: Date | null;

    @Field({ nullable: true })
    RecurrenceMonths?: string | null;

    @Field({ nullable: true })
    RecurrenceDaysOfWeek?: string | null;

    @Field(() => Int, { nullable: true })
    RecurrenceDayOfMonthMin?: number | null;

    @Field(() => Int, { nullable: true })
    RecurrenceDayOfMonthMax?: number | null;

    @Field({ nullable: true })
    TimeOfDayStart?: Date | null;

    @Field({ nullable: true })
    TimeOfDayEnd?: Date | null;

    @Field(() => Int, { nullable: true })
    Priority?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Product Prices
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersProductPriceViewResult {
    @Field(() => [mjBizAppsOrdersProductPrice_])
    Results: mjBizAppsOrdersProductPrice_[];

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

@Resolver(mjBizAppsOrdersProductPrice_)
export class mjBizAppsOrdersProductPriceResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersProductPriceViewResult)
    async RunmjBizAppsOrdersProductPriceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductPriceViewResult)
    async RunmjBizAppsOrdersProductPriceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersProductPriceViewResult)
    async RunmjBizAppsOrdersProductPriceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Product Prices';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersProductPrice_, { nullable: true })
    async mjBizAppsOrdersProductPrice(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersProductPrice_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Prices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductPrices')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Prices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Prices', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_ProductPriceIDArray(@Root() mjbizappsordersproductprice_: mjBizAppsOrdersProductPrice_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('ProductPriceID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproductprice_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPriceTier_])
    async mjBizAppsOrdersPriceTiers_ProductPriceIDArray(@Root() mjbizappsordersproductprice_: mjBizAppsOrdersProductPrice_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Price Tiers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPriceTiers')} WHERE ${provider.QuoteIdentifier('ProductPriceID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Price Tiers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproductprice_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Price Tiers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersProductPrice_)
    async CreatemjBizAppsOrdersProductPrice(
        @Arg('input', () => CreatemjBizAppsOrdersProductPriceInput) input: CreatemjBizAppsOrdersProductPriceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Product Prices', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersProductPrice_)
    async UpdatemjBizAppsOrdersProductPrice(
        @Arg('input', () => UpdatemjBizAppsOrdersProductPriceInput) input: UpdatemjBizAppsOrdersProductPriceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Product Prices', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersProductPrice_)
    async DeletemjBizAppsOrdersProductPrice(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Product Prices', key, options, provider, userPayload, pubSub);
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
        
    @Field({nullable: true, description: `Stable machine code (Event, Membership, PhysicalGood, ...). Unique when present; seeded types carry codes.`}) 
    @MaxLength(40)
    Code?: string;
        
    @Field({description: `Display name of the product type. Unique.`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Optional description of the product type.`}) 
    Description?: string;
        
    @Field(() => Boolean, {description: `When 1, orders containing products of this type hold at Posted until a fulfiller marks every such line Fulfilled; when no line requires fulfillment the order auto-advances to Fulfilled.`}) 
    RequiresFulfillment: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    DefaultRevenueRecognitionTypeID?: string;
        
    @Field(() => Boolean, {description: `Default taxability stamped onto new products of this type.`}) 
    DefaultIsTaxable: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    DefaultSubscriptionTypeID?: string;
        
    @Field({nullable: true, description: `MJ entity name of the IsA Product-level extension for this type (e.g. MJ_BizApps_Orders: Event Products). NULL = no extension (BO-D37).`}) 
    @MaxLength(255)
    ProductExtensionEntity?: string;
        
    @Field({nullable: true, description: `MJ entity name of the IsA OrderLine-level extension for this type (e.g. MJ_BizApps_Orders: Event Order Lines). NULL = no extension (BO-D37).`}) 
    @MaxLength(255)
    OrderLineExtensionEntity?: string;
        
    @Field(() => Boolean, {description: `Whether this type is active and selectable.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DefaultRevenueRecognitionType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DefaultSubscriptionType?: string;
        
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
    Code: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Boolean, { nullable: true })
    RequiresFulfillment?: boolean;

    @Field({ nullable: true })
    DefaultRevenueRecognitionTypeID: string | null;

    @Field(() => Boolean, { nullable: true })
    DefaultIsTaxable?: boolean;

    @Field({ nullable: true })
    DefaultSubscriptionTypeID: string | null;

    @Field({ nullable: true })
    ProductExtensionEntity: string | null;

    @Field({ nullable: true })
    OrderLineExtensionEntity: string | null;

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
    Code?: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Boolean, { nullable: true })
    RequiresFulfillment?: boolean;

    @Field({ nullable: true })
    DefaultRevenueRecognitionTypeID?: string | null;

    @Field(() => Boolean, { nullable: true })
    DefaultIsTaxable?: boolean;

    @Field({ nullable: true })
    DefaultSubscriptionTypeID?: string | null;

    @Field({ nullable: true })
    ProductExtensionEntity?: string | null;

    @Field({ nullable: true })
    OrderLineExtensionEntity?: string | null;

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
        
    @Field({nullable: true, description: `Stock-keeping unit / product code. Unique when present.`}) 
    @MaxLength(80)
    SKU?: string;
        
    @Field() 
    @MaxLength(36)
    ProductTypeID: string;
        
    @Field() 
    @MaxLength(36)
    ProductCategoryID: string;
        
    @Field({description: `The company whose revenue this product accrues to — the SOURCE OF TRUTH for order-line ownership (D6). Stamped onto OrderLine.CompanyID at line save. GL routing is via accounting's GLAccountLink, anchored at this company (D5).`}) 
    @MaxLength(36)
    CompanyID: string;
        
    @Field({description: `Draft | Active | Discontinued | EOL — catalog lifecycle. Data-only until the catalog engine gates ordering on it.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SuccessorProductID?: string;
        
    @Field({nullable: true, description: `First date the product may be sold.`}) 
    AvailableFrom?: Date;
        
    @Field({nullable: true, description: `Last date the product may be sold.`}) 
    AvailableTo?: Date;
        
    @Field({description: `HOW revenue for this product is earned (plan D43). Resolves to a pluggable driver via RevenueRecognitionType.DriverClass; the driver returns a schedule and the order entity turns it into forward-dated journal entries.`}) 
    @MaxLength(36)
    RevenueRecognitionTypeID: string;
        
    @Field(() => Float, {nullable: true, description: `Standalone selling price for ASC 606 bundle revenue allocation (BO-D35; fields now, allocation engine later).`}) 
    StandaloneSellingPrice?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    SubscriptionTypeID?: string;
        
    @Field(() => Boolean, {description: `Whether this product is subject to tax (tax subsystem lands at O4).`}) 
    IsTaxable: boolean;
        
    @Field({nullable: true, description: `Optional description of the product.`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Taxability key, matched against accounting's TaxRate.TaxCategory. A string rather than a lookup table because accounting already keys taxability by string, and a table here would need syncing to it and could drift.`}) 
    @MaxLength(50)
    TaxCategory?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    ProductType: string;
        
    @Field() 
    @MaxLength(200)
    ProductCategory: string;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    SuccessorProduct?: string;
        
    @Field() 
    @MaxLength(200)
    RevenueRecognitionType: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    SubscriptionType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootSuccessorProductID?: string;
        
    @Field(() => [mjBizAppsOrdersProductPrice_])
    mjBizAppsOrdersProductPrices_ProductIDArray: mjBizAppsOrdersProductPrice_[]; // Link to mjBizAppsOrdersProductPrices
    
    @Field(() => [mjBizAppsOrdersPromotionTarget_])
    mjBizAppsOrdersPromotionTargets_ProductIDArray: mjBizAppsOrdersPromotionTarget_[]; // Link to mjBizAppsOrdersPromotionTargets
    
    @Field(() => [mjBizAppsOrdersSubscription_])
    mjBizAppsOrdersSubscriptions_ProductIDArray: mjBizAppsOrdersSubscription_[]; // Link to mjBizAppsOrdersSubscriptions
    
    @Field(() => [mjBizAppsOrdersProductBundleItem_])
    mjBizAppsOrdersProductBundleItems_BundleProductIDArray: mjBizAppsOrdersProductBundleItem_[]; // Link to mjBizAppsOrdersProductBundleItems
    
    @Field(() => [mjBizAppsOrdersProductBundleItem_])
    mjBizAppsOrdersProductBundleItems_ComponentProductIDArray: mjBizAppsOrdersProductBundleItem_[]; // Link to mjBizAppsOrdersProductBundleItems
    
    @Field(() => [mjBizAppsOrdersProduct_])
    mjBizAppsOrdersProducts_SuccessorProductIDArray: mjBizAppsOrdersProduct_[]; // Link to mjBizAppsOrdersProducts
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_SourceBundleProductIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_ProductIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
    @Field(() => [mjBizAppsOrdersProductPerformanceObligation_])
    mjBizAppsOrdersProductPerformanceObligations_ProductIDArray: mjBizAppsOrdersProductPerformanceObligation_[]; // Link to mjBizAppsOrdersProductPerformanceObligations
    
    @Field(() => [mjBizAppsOrdersEventProduct_])
    mjBizAppsOrdersEventProducts_IDArray: mjBizAppsOrdersEventProduct_[]; // Link to mjBizAppsOrdersEventProducts
    
    @Field(() => [mjBizAppsOrdersProductEntitlement_])
    mjBizAppsOrdersProductEntitlements_ProductIDArray: mjBizAppsOrdersProductEntitlement_[]; // Link to mjBizAppsOrdersProductEntitlements
    
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
    SKU: string | null;

    @Field({ nullable: true })
    ProductTypeID?: string;

    @Field({ nullable: true })
    ProductCategoryID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SuccessorProductID: string | null;

    @Field({ nullable: true })
    AvailableFrom: Date | null;

    @Field({ nullable: true })
    AvailableTo: Date | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field(() => Float, { nullable: true })
    StandaloneSellingPrice: number | null;

    @Field({ nullable: true })
    SubscriptionTypeID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsTaxable?: boolean;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TaxCategory: string | null;

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
    SKU?: string | null;

    @Field({ nullable: true })
    ProductTypeID?: string;

    @Field({ nullable: true })
    ProductCategoryID?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SuccessorProductID?: string | null;

    @Field({ nullable: true })
    AvailableFrom?: Date | null;

    @Field({ nullable: true })
    AvailableTo?: Date | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field(() => Float, { nullable: true })
    StandaloneSellingPrice?: number | null;

    @Field({ nullable: true })
    SubscriptionTypeID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsTaxable?: boolean;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TaxCategory?: string | null;

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
    
    @FieldResolver(() => [mjBizAppsOrdersProductPrice_])
    async mjBizAppsOrdersProductPrices_ProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Prices', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductPrices')} WHERE ${provider.QuoteIdentifier('ProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Prices', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Prices', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPromotionTarget_])
    async mjBizAppsOrdersPromotionTargets_ProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Targets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionTargets')} WHERE ${provider.QuoteIdentifier('ProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Targets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Targets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscription_])
    async mjBizAppsOrdersSubscriptions_ProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('ProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProductBundleItem_])
    async mjBizAppsOrdersProductBundleItems_BundleProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Bundle Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductBundleItems')} WHERE ${provider.QuoteIdentifier('BundleProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Bundle Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Bundle Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProductBundleItem_])
    async mjBizAppsOrdersProductBundleItems_ComponentProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Bundle Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductBundleItems')} WHERE ${provider.QuoteIdentifier('ComponentProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Bundle Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Bundle Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProduct_])
    async mjBizAppsOrdersProducts_SuccessorProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProducts')} WHERE ${provider.QuoteIdentifier('SuccessorProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Products', rows, this.GetUserFromPayload(userPayload));
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
        
    @FieldResolver(() => [mjBizAppsOrdersProductPerformanceObligation_])
    async mjBizAppsOrdersProductPerformanceObligations_ProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Performance Obligations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductPerformanceObligations')} WHERE ${provider.QuoteIdentifier('ProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Performance Obligations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Performance Obligations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersEventProduct_])
    async mjBizAppsOrdersEventProducts_IDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Event Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEventProducts')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Event Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Event Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProductEntitlement_])
    async mjBizAppsOrdersProductEntitlements_ProductIDArray(@Root() mjbizappsordersproduct_: mjBizAppsOrdersProduct_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Entitlements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductEntitlements')} WHERE ${provider.QuoteIdentifier('ProductID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Entitlements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersproduct_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Entitlements', rows, this.GetUserFromPayload(userPayload));
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

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Promotion Codes
//****************************************************************************
@ObjectType({ description: `A redeemable string pointing at a Promotion. Deliberately carries NO redemption counter: a stored count drifts the first time anything is voided, so redemptions are counted from OrderAdjustment - the record of what actually happened.` })
export class mjBizAppsOrdersPromotionCode_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PromotionID: string;
        
    @Field() 
    @MaxLength(60)
    Code: string;
        
    @Field(() => Int, {nullable: true, description: `Cap for THIS code, distinct from the promotion's overall cap.`}) 
    MaxRedemptions?: number;
        
    @Field({nullable: true, description: `Restricts the code to one organization. NULL means anyone may use it.`}) 
    @MaxLength(36)
    AssignedOrganizationID?: string;
        
    @Field({nullable: true, description: `Restricts the code to one individual. NULL means anyone may use it.`}) 
    @MaxLength(36)
    AssignedPersonID?: string;
        
    @Field({nullable: true}) 
    EffectiveFrom?: Date;
        
    @Field({nullable: true}) 
    EffectiveTo?: Date;
        
    @Field() 
    @MaxLength(10)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Promotion: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AssignedOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    AssignedPerson?: string;
        
    @Field(() => [mjBizAppsOrdersOrderAdjustment_])
    mjBizAppsOrdersOrderAdjustments_PromotionCodeIDArray: mjBizAppsOrdersOrderAdjustment_[]; // Link to mjBizAppsOrdersOrderAdjustments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotion Codes
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPromotionCodeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PromotionID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field(() => Int, { nullable: true })
    MaxRedemptions: number | null;

    @Field({ nullable: true })
    AssignedOrganizationID: string | null;

    @Field({ nullable: true })
    AssignedPersonID: string | null;

    @Field({ nullable: true })
    EffectiveFrom: Date | null;

    @Field({ nullable: true })
    EffectiveTo: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotion Codes
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPromotionCodeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PromotionID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field(() => Int, { nullable: true })
    MaxRedemptions?: number | null;

    @Field({ nullable: true })
    AssignedOrganizationID?: string | null;

    @Field({ nullable: true })
    AssignedPersonID?: string | null;

    @Field({ nullable: true })
    EffectiveFrom?: Date | null;

    @Field({ nullable: true })
    EffectiveTo?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Promotion Codes
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPromotionCodeViewResult {
    @Field(() => [mjBizAppsOrdersPromotionCode_])
    Results: mjBizAppsOrdersPromotionCode_[];

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

@Resolver(mjBizAppsOrdersPromotionCode_)
export class mjBizAppsOrdersPromotionCodeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPromotionCodeViewResult)
    async RunmjBizAppsOrdersPromotionCodeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionCodeViewResult)
    async RunmjBizAppsOrdersPromotionCodeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionCodeViewResult)
    async RunmjBizAppsOrdersPromotionCodeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Promotion Codes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPromotionCode_, { nullable: true })
    async mjBizAppsOrdersPromotionCode(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPromotionCode_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionCodes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Codes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustment_])
    async mjBizAppsOrdersOrderAdjustments_PromotionCodeIDArray(@Root() mjbizappsorderspromotioncode_: mjBizAppsOrdersPromotionCode_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustments')} WHERE ${provider.QuoteIdentifier('PromotionCodeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspromotioncode_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPromotionCode_)
    async CreatemjBizAppsOrdersPromotionCode(
        @Arg('input', () => CreatemjBizAppsOrdersPromotionCodeInput) input: CreatemjBizAppsOrdersPromotionCodeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Promotion Codes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPromotionCode_)
    async UpdatemjBizAppsOrdersPromotionCode(
        @Arg('input', () => UpdatemjBizAppsOrdersPromotionCodeInput) input: UpdatemjBizAppsOrdersPromotionCodeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Promotion Codes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPromotionCode_)
    async DeletemjBizAppsOrdersPromotionCode(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Promotion Codes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Promotion Targets
//****************************************************************************
@ObjectType({ description: `What a promotion applies to. NO ROWS MEANS IT APPLIES TO EVERYTHING - absence as \'global\' avoids a Scope enum whose values would have to stay in sync with which columns are populated, two facts that drift apart.` })
export class mjBizAppsOrdersPromotionTarget_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    PromotionID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ProductID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ProductCategoryID?: string;
        
    @Field(() => Boolean, {description: `For a category target, whether child categories are included.`}) 
    IncludeDescendants: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    Promotion: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Product?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ProductCategory?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotion Targets
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPromotionTargetInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PromotionID?: string;

    @Field({ nullable: true })
    ProductID: string | null;

    @Field({ nullable: true })
    ProductCategoryID: string | null;

    @Field(() => Boolean, { nullable: true })
    IncludeDescendants?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotion Targets
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPromotionTargetInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PromotionID?: string;

    @Field({ nullable: true })
    ProductID?: string | null;

    @Field({ nullable: true })
    ProductCategoryID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IncludeDescendants?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Promotion Targets
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPromotionTargetViewResult {
    @Field(() => [mjBizAppsOrdersPromotionTarget_])
    Results: mjBizAppsOrdersPromotionTarget_[];

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

@Resolver(mjBizAppsOrdersPromotionTarget_)
export class mjBizAppsOrdersPromotionTargetResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPromotionTargetViewResult)
    async RunmjBizAppsOrdersPromotionTargetViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionTargetViewResult)
    async RunmjBizAppsOrdersPromotionTargetViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionTargetViewResult)
    async RunmjBizAppsOrdersPromotionTargetDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Promotion Targets';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPromotionTarget_, { nullable: true })
    async mjBizAppsOrdersPromotionTarget(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPromotionTarget_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Targets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionTargets')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Targets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Targets', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersPromotionTarget_)
    async CreatemjBizAppsOrdersPromotionTarget(
        @Arg('input', () => CreatemjBizAppsOrdersPromotionTargetInput) input: CreatemjBizAppsOrdersPromotionTargetInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Promotion Targets', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPromotionTarget_)
    async UpdatemjBizAppsOrdersPromotionTarget(
        @Arg('input', () => UpdatemjBizAppsOrdersPromotionTargetInput) input: UpdatemjBizAppsOrdersPromotionTargetInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Promotion Targets', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPromotionTarget_)
    async DeletemjBizAppsOrdersPromotionTarget(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Promotion Targets', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Promotion Types
//****************************************************************************
@ObjectType({ description: `The discount shape a promotion takes: percent off, amount off, override price, free shipping. A lookup rather than a CHECK so types are additive at runtime, and so Code can key a ClassFactory registration for custom behaviour.` })
export class mjBizAppsOrdersPromotionType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersPromotion_])
    mjBizAppsOrdersPromotions_PromotionTypeIDArray: mjBizAppsOrdersPromotion_[]; // Link to mjBizAppsOrdersPromotions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotion Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPromotionTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotion Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPromotionTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Promotion Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPromotionTypeViewResult {
    @Field(() => [mjBizAppsOrdersPromotionType_])
    Results: mjBizAppsOrdersPromotionType_[];

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

@Resolver(mjBizAppsOrdersPromotionType_)
export class mjBizAppsOrdersPromotionTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPromotionTypeViewResult)
    async RunmjBizAppsOrdersPromotionTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionTypeViewResult)
    async RunmjBizAppsOrdersPromotionTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionTypeViewResult)
    async RunmjBizAppsOrdersPromotionTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Promotion Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPromotionType_, { nullable: true })
    async mjBizAppsOrdersPromotionType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPromotionType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPromotion_])
    async mjBizAppsOrdersPromotions_PromotionTypeIDArray(@Root() mjbizappsorderspromotiontype_: mjBizAppsOrdersPromotionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotions')} WHERE ${provider.QuoteIdentifier('PromotionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspromotiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPromotionType_)
    async CreatemjBizAppsOrdersPromotionType(
        @Arg('input', () => CreatemjBizAppsOrdersPromotionTypeInput) input: CreatemjBizAppsOrdersPromotionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Promotion Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPromotionType_)
    async UpdatemjBizAppsOrdersPromotionType(
        @Arg('input', () => UpdatemjBizAppsOrdersPromotionTypeInput) input: UpdatemjBizAppsOrdersPromotionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Promotion Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPromotionType_)
    async DeletemjBizAppsOrdersPromotionType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Promotion Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Promotions
//****************************************************************************
@ObjectType({ description: `A promotional OFFER and its rules. Distinct from PromotionCode, which is a redeemable string pointing here - one promotion can have many codes (public, per-campaign, per-customer) without duplicating the offer. Follows Stripe\'s Coupon / Promotion Code split, which is the launch provider, so the mapping is one-to-one.` })
export class mjBizAppsOrdersPromotion_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Internal handle for this offer. NOT the redeemable code - those live on PromotionCode.`}) 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(36)
    PromotionTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CompanyID?: string;
        
    @Field(() => Float, {description: `Magnitude, interpreted by the type: 0.10 for ten percent off, or a currency amount.`}) 
    Value: number;
        
    @Field({description: `Line | Order | Either. An order-level promotion is always allocated down to lines, because tax and GL are per line.`}) 
    @MaxLength(10)
    AppliesAt: string;
        
    @Field(() => Boolean, {description: `Whether this may combine with others. Defaults OFF - a promotion must opt in. When two non-stacking promotions collide the HIGHER VALUE wins, and the loser is recorded as offered-not-applied so 'why didn''t my code work?' has an answer.`}) 
    AllowsStacking: boolean;
        
    @Field(() => Int, {description: `Order of application when several stack.`}) 
    StackSequence: number;
        
    @Field(() => Int, {nullable: true, description: `Total redemptions across all customers. NULL is unlimited. Counted from OrderAdjustment rather than a stored counter, which would drift the first time anything was voided.`}) 
    MaxRedemptions?: number;
        
    @Field(() => Int, {nullable: true, description: `Redemptions allowed per customer. NULL is unlimited.`}) 
    MaxRedemptionsPerCustomer?: number;
        
    @Field(() => Float, {nullable: true, description: `Order must reach this value for the promotion to apply.`}) 
    MinimumOrderAmount?: number;
        
    @Field(() => Float, {nullable: true, description: `Line must reach this quantity for the promotion to apply.`}) 
    MinimumQuantity?: number;
        
    @Field({nullable: true}) 
    EffectiveFrom?: Date;
        
    @Field({nullable: true}) 
    EffectiveTo?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    RecurrenceMonths?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    RecurrenceDaysOfWeek?: string;
        
    @Field({nullable: true}) 
    TimeOfDayStart?: Date;
        
    @Field({nullable: true}) 
    TimeOfDayEnd?: Date;
        
    @Field({nullable: true, description: `ClassFactory key for a BasePromotionQualifier plugin implementing arbitrary eligibility - member for two years, first-time buyer, holds an active subscription - without a schema change.`}) 
    @MaxLength(100)
    QualifierKey?: string;
        
    @Field({description: `Draft | Active | Paused | Expired. Only Active promotions resolve.`}) 
    @MaxLength(10)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    PromotionType: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    Company?: string;
        
    @Field(() => [mjBizAppsOrdersPromotionTarget_])
    mjBizAppsOrdersPromotionTargets_PromotionIDArray: mjBizAppsOrdersPromotionTarget_[]; // Link to mjBizAppsOrdersPromotionTargets
    
    @Field(() => [mjBizAppsOrdersPromotionCode_])
    mjBizAppsOrdersPromotionCodes_PromotionIDArray: mjBizAppsOrdersPromotionCode_[]; // Link to mjBizAppsOrdersPromotionCodes
    
    @Field(() => [mjBizAppsOrdersOrderAdjustment_])
    mjBizAppsOrdersOrderAdjustments_PromotionIDArray: mjBizAppsOrdersOrderAdjustment_[]; // Link to mjBizAppsOrdersOrderAdjustments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotions
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersPromotionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    PromotionTypeID?: string;

    @Field({ nullable: true })
    CompanyID: string | null;

    @Field(() => Float, { nullable: true })
    Value?: number;

    @Field({ nullable: true })
    AppliesAt?: string;

    @Field(() => Boolean, { nullable: true })
    AllowsStacking?: boolean;

    @Field(() => Int, { nullable: true })
    StackSequence?: number;

    @Field(() => Int, { nullable: true })
    MaxRedemptions: number | null;

    @Field(() => Int, { nullable: true })
    MaxRedemptionsPerCustomer: number | null;

    @Field(() => Float, { nullable: true })
    MinimumOrderAmount: number | null;

    @Field(() => Float, { nullable: true })
    MinimumQuantity: number | null;

    @Field({ nullable: true })
    EffectiveFrom: Date | null;

    @Field({ nullable: true })
    EffectiveTo: Date | null;

    @Field({ nullable: true })
    RecurrenceMonths: string | null;

    @Field({ nullable: true })
    RecurrenceDaysOfWeek: string | null;

    @Field({ nullable: true })
    TimeOfDayStart: Date | null;

    @Field({ nullable: true })
    TimeOfDayEnd: Date | null;

    @Field({ nullable: true })
    QualifierKey: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Promotions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersPromotionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    PromotionTypeID?: string;

    @Field({ nullable: true })
    CompanyID?: string | null;

    @Field(() => Float, { nullable: true })
    Value?: number;

    @Field({ nullable: true })
    AppliesAt?: string;

    @Field(() => Boolean, { nullable: true })
    AllowsStacking?: boolean;

    @Field(() => Int, { nullable: true })
    StackSequence?: number;

    @Field(() => Int, { nullable: true })
    MaxRedemptions?: number | null;

    @Field(() => Int, { nullable: true })
    MaxRedemptionsPerCustomer?: number | null;

    @Field(() => Float, { nullable: true })
    MinimumOrderAmount?: number | null;

    @Field(() => Float, { nullable: true })
    MinimumQuantity?: number | null;

    @Field({ nullable: true })
    EffectiveFrom?: Date | null;

    @Field({ nullable: true })
    EffectiveTo?: Date | null;

    @Field({ nullable: true })
    RecurrenceMonths?: string | null;

    @Field({ nullable: true })
    RecurrenceDaysOfWeek?: string | null;

    @Field({ nullable: true })
    TimeOfDayStart?: Date | null;

    @Field({ nullable: true })
    TimeOfDayEnd?: Date | null;

    @Field({ nullable: true })
    QualifierKey?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Promotions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersPromotionViewResult {
    @Field(() => [mjBizAppsOrdersPromotion_])
    Results: mjBizAppsOrdersPromotion_[];

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

@Resolver(mjBizAppsOrdersPromotion_)
export class mjBizAppsOrdersPromotionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersPromotionViewResult)
    async RunmjBizAppsOrdersPromotionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionViewResult)
    async RunmjBizAppsOrdersPromotionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersPromotionViewResult)
    async RunmjBizAppsOrdersPromotionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Promotions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersPromotion_, { nullable: true })
    async mjBizAppsOrdersPromotion(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersPromotion_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersPromotionTarget_])
    async mjBizAppsOrdersPromotionTargets_PromotionIDArray(@Root() mjbizappsorderspromotion_: mjBizAppsOrdersPromotion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Targets', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionTargets')} WHERE ${provider.QuoteIdentifier('PromotionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Targets', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspromotion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Targets', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPromotionCode_])
    async mjBizAppsOrdersPromotionCodes_PromotionIDArray(@Root() mjbizappsorderspromotion_: mjBizAppsOrdersPromotion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Promotion Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPromotionCodes')} WHERE ${provider.QuoteIdentifier('PromotionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Promotion Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspromotion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Promotion Codes', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustment_])
    async mjBizAppsOrdersOrderAdjustments_PromotionIDArray(@Root() mjbizappsorderspromotion_: mjBizAppsOrdersPromotion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustments')} WHERE ${provider.QuoteIdentifier('PromotionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderspromotion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersPromotion_)
    async CreatemjBizAppsOrdersPromotion(
        @Arg('input', () => CreatemjBizAppsOrdersPromotionInput) input: CreatemjBizAppsOrdersPromotionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Promotions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersPromotion_)
    async UpdatemjBizAppsOrdersPromotion(
        @Arg('input', () => UpdatemjBizAppsOrdersPromotionInput) input: UpdatemjBizAppsOrdersPromotionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Promotions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersPromotion_)
    async DeletemjBizAppsOrdersPromotion(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Promotions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Rev Rec Schedule Lines
//****************************************************************************
@ObjectType({ description: `One recognition period of a schedule (D14). Line 1 carries the rounding remainder. A real forward-dated JournalEntry is written per period at booking-lock; the ledger is the truth — no recognition-state tracking here.` })
export class mjBizAppsOrdersRevRecScheduleLine_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ScheduleID: string;
        
    @Field({description: `Start of this recognition period.`}) 
    PeriodStart: Date;
        
    @Field({description: `End of this recognition period.`}) 
    PeriodEnd: Date;
        
    @Field(() => Float, {description: `Amount recognized in this period.`}) 
    Amount: number;
        
    @Field({nullable: true, description: `FK to the FORWARD-DATED __mj_BizAppsAccounting.JournalEntry staged for this period at booking-lock (D14): Dr Deferred Revenue / Cr Revenue, EffectiveDate = this period's recognition date, Status=Pending until swept into a batch.`}) 
    @MaxLength(36)
    JournalEntryID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(40)
    JournalEntry?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Rev Rec Schedule Lines
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersRevRecScheduleLineInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ScheduleID?: string;

    @Field({ nullable: true })
    PeriodStart?: Date;

    @Field({ nullable: true })
    PeriodEnd?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    JournalEntryID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Rev Rec Schedule Lines
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersRevRecScheduleLineInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ScheduleID?: string;

    @Field({ nullable: true })
    PeriodStart?: Date;

    @Field({ nullable: true })
    PeriodEnd?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field({ nullable: true })
    JournalEntryID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Rev Rec Schedule Lines
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersRevRecScheduleLineViewResult {
    @Field(() => [mjBizAppsOrdersRevRecScheduleLine_])
    Results: mjBizAppsOrdersRevRecScheduleLine_[];

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

@Resolver(mjBizAppsOrdersRevRecScheduleLine_)
export class mjBizAppsOrdersRevRecScheduleLineResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersRevRecScheduleLineViewResult)
    async RunmjBizAppsOrdersRevRecScheduleLineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersRevRecScheduleLineViewResult)
    async RunmjBizAppsOrdersRevRecScheduleLineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersRevRecScheduleLineViewResult)
    async RunmjBizAppsOrdersRevRecScheduleLineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Rev Rec Schedule Lines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersRevRecScheduleLine_, { nullable: true })
    async mjBizAppsOrdersRevRecScheduleLine(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersRevRecScheduleLine_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Rev Rec Schedule Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwRevRecScheduleLines')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Rev Rec Schedule Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Rev Rec Schedule Lines', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersRevRecScheduleLine_)
    async CreatemjBizAppsOrdersRevRecScheduleLine(
        @Arg('input', () => CreatemjBizAppsOrdersRevRecScheduleLineInput) input: CreatemjBizAppsOrdersRevRecScheduleLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Rev Rec Schedule Lines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersRevRecScheduleLine_)
    async UpdatemjBizAppsOrdersRevRecScheduleLine(
        @Arg('input', () => UpdatemjBizAppsOrdersRevRecScheduleLineInput) input: UpdatemjBizAppsOrdersRevRecScheduleLineInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Rev Rec Schedule Lines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersRevRecScheduleLine_)
    async DeletemjBizAppsOrdersRevRecScheduleLine(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Rev Rec Schedule Lines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Revenue Recognition Schedules
//****************************************************************************
@ObjectType({ description: `The COMPUTED recognition envelope (method, dates, totals) — kept for MRR/ARR display and as the computation source (D14). Owned by an order line. The ledger truth is the real forward-dated JournalEntry rows written at booking-lock; changes net via correcting orders, never edits.` })
export class mjBizAppsOrdersRevenueRecognitionSchedule_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    RevenueRecognitionTypeID: string;
        
    @Field({description: `First recognition date.`}) 
    StartDate: Date;
        
    @Field({description: `Last recognition date.`}) 
    EndDate: Date;
        
    @Field(() => Float, {description: `Total amount to recognize across all schedule lines.`}) 
    TotalAmount: number;
        
    @Field(() => Float, {description: `Amount recognized so far (engine-maintained).`}) 
    TotalRecognized: number;
        
    @Field(() => Boolean, {description: `Whether every line has been recognized.`}) 
    IsComplete: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    RevenueRecognitionType: string;
        
    @Field(() => [mjBizAppsOrdersRevRecScheduleLine_])
    mjBizAppsOrdersRevRecScheduleLines_ScheduleIDArray: mjBizAppsOrdersRevRecScheduleLine_[]; // Link to mjBizAppsOrdersRevRecScheduleLines
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_RevenueRecognitionScheduleIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Revenue Recognition Schedules
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersRevenueRecognitionScheduleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number;

    @Field(() => Float, { nullable: true })
    TotalRecognized?: number;

    @Field(() => Boolean, { nullable: true })
    IsComplete?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Revenue Recognition Schedules
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersRevenueRecognitionScheduleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field(() => Float, { nullable: true })
    TotalAmount?: number;

    @Field(() => Float, { nullable: true })
    TotalRecognized?: number;

    @Field(() => Boolean, { nullable: true })
    IsComplete?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Revenue Recognition Schedules
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersRevenueRecognitionScheduleViewResult {
    @Field(() => [mjBizAppsOrdersRevenueRecognitionSchedule_])
    Results: mjBizAppsOrdersRevenueRecognitionSchedule_[];

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

@Resolver(mjBizAppsOrdersRevenueRecognitionSchedule_)
export class mjBizAppsOrdersRevenueRecognitionScheduleResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersRevenueRecognitionScheduleViewResult)
    async RunmjBizAppsOrdersRevenueRecognitionScheduleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersRevenueRecognitionScheduleViewResult)
    async RunmjBizAppsOrdersRevenueRecognitionScheduleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersRevenueRecognitionScheduleViewResult)
    async RunmjBizAppsOrdersRevenueRecognitionScheduleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Revenue Recognition Schedules';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersRevenueRecognitionSchedule_, { nullable: true })
    async mjBizAppsOrdersRevenueRecognitionSchedule(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersRevenueRecognitionSchedule_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Revenue Recognition Schedules', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwRevenueRecognitionSchedules')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Revenue Recognition Schedules', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Revenue Recognition Schedules', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersRevRecScheduleLine_])
    async mjBizAppsOrdersRevRecScheduleLines_ScheduleIDArray(@Root() mjbizappsordersrevenuerecognitionschedule_: mjBizAppsOrdersRevenueRecognitionSchedule_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Rev Rec Schedule Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwRevRecScheduleLines')} WHERE ${provider.QuoteIdentifier('ScheduleID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Rev Rec Schedule Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitionschedule_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Rev Rec Schedule Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_RevenueRecognitionScheduleIDArray(@Root() mjbizappsordersrevenuerecognitionschedule_: mjBizAppsOrdersRevenueRecognitionSchedule_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('RevenueRecognitionScheduleID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitionschedule_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersRevenueRecognitionSchedule_)
    async CreatemjBizAppsOrdersRevenueRecognitionSchedule(
        @Arg('input', () => CreatemjBizAppsOrdersRevenueRecognitionScheduleInput) input: CreatemjBizAppsOrdersRevenueRecognitionScheduleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Revenue Recognition Schedules', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersRevenueRecognitionSchedule_)
    async UpdatemjBizAppsOrdersRevenueRecognitionSchedule(
        @Arg('input', () => UpdatemjBizAppsOrdersRevenueRecognitionScheduleInput) input: UpdatemjBizAppsOrdersRevenueRecognitionScheduleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Revenue Recognition Schedules', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersRevenueRecognitionSchedule_)
    async DeletemjBizAppsOrdersRevenueRecognitionSchedule(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Revenue Recognition Schedules', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Revenue Recognition Types
//****************************************************************************
@ObjectType()
export class mjBizAppsOrdersRevenueRecognitionType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(200)
    DriverClass: string;
        
    @Field(() => Boolean) 
    IsDeferred: boolean;
        
    @Field(() => Boolean) 
    RequiresServicePeriod: boolean;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersRevenueRecognitionSchedule_])
    mjBizAppsOrdersRevenueRecognitionSchedules_RevenueRecognitionTypeIDArray: mjBizAppsOrdersRevenueRecognitionSchedule_[]; // Link to mjBizAppsOrdersRevenueRecognitionSchedules
    
    @Field(() => [mjBizAppsOrdersProductPerformanceObligation_])
    mjBizAppsOrdersProductPerformanceObligations_RevenueRecognitionTypeIDArray: mjBizAppsOrdersProductPerformanceObligation_[]; // Link to mjBizAppsOrdersProductPerformanceObligations
    
    @Field(() => [mjBizAppsOrdersSubscriptionTerm_])
    mjBizAppsOrdersSubscriptionTerms_RevenueRecognitionTypeIDArray: mjBizAppsOrdersSubscriptionTerm_[]; // Link to mjBizAppsOrdersSubscriptionTerms
    
    @Field(() => [mjBizAppsOrdersProduct_])
    mjBizAppsOrdersProducts_RevenueRecognitionTypeIDArray: mjBizAppsOrdersProduct_[]; // Link to mjBizAppsOrdersProducts
    
    @Field(() => [mjBizAppsOrdersProductType_])
    mjBizAppsOrdersProductTypes_DefaultRevenueRecognitionTypeIDArray: mjBizAppsOrdersProductType_[]; // Link to mjBizAppsOrdersProductTypes
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Revenue Recognition Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersRevenueRecognitionTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeferred?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresServicePeriod?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Revenue Recognition Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersRevenueRecognitionTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeferred?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresServicePeriod?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Revenue Recognition Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersRevenueRecognitionTypeViewResult {
    @Field(() => [mjBizAppsOrdersRevenueRecognitionType_])
    Results: mjBizAppsOrdersRevenueRecognitionType_[];

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

@Resolver(mjBizAppsOrdersRevenueRecognitionType_)
export class mjBizAppsOrdersRevenueRecognitionTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersRevenueRecognitionTypeViewResult)
    async RunmjBizAppsOrdersRevenueRecognitionTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersRevenueRecognitionTypeViewResult)
    async RunmjBizAppsOrdersRevenueRecognitionTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersRevenueRecognitionTypeViewResult)
    async RunmjBizAppsOrdersRevenueRecognitionTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Revenue Recognition Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersRevenueRecognitionType_, { nullable: true })
    async mjBizAppsOrdersRevenueRecognitionType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersRevenueRecognitionType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Revenue Recognition Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwRevenueRecognitionTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Revenue Recognition Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Revenue Recognition Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersRevenueRecognitionSchedule_])
    async mjBizAppsOrdersRevenueRecognitionSchedules_RevenueRecognitionTypeIDArray(@Root() mjbizappsordersrevenuerecognitiontype_: mjBizAppsOrdersRevenueRecognitionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Revenue Recognition Schedules', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwRevenueRecognitionSchedules')} WHERE ${provider.QuoteIdentifier('RevenueRecognitionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Revenue Recognition Schedules', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Revenue Recognition Schedules', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProductPerformanceObligation_])
    async mjBizAppsOrdersProductPerformanceObligations_RevenueRecognitionTypeIDArray(@Root() mjbizappsordersrevenuerecognitiontype_: mjBizAppsOrdersRevenueRecognitionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Performance Obligations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductPerformanceObligations')} WHERE ${provider.QuoteIdentifier('RevenueRecognitionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Performance Obligations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Performance Obligations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscriptionTerm_])
    async mjBizAppsOrdersSubscriptionTerms_RevenueRecognitionTypeIDArray(@Root() mjbizappsordersrevenuerecognitiontype_: mjBizAppsOrdersRevenueRecognitionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Terms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionTerms')} WHERE ${provider.QuoteIdentifier('RevenueRecognitionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Terms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Terms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProduct_])
    async mjBizAppsOrdersProducts_RevenueRecognitionTypeIDArray(@Root() mjbizappsordersrevenuerecognitiontype_: mjBizAppsOrdersRevenueRecognitionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProducts')} WHERE ${provider.QuoteIdentifier('RevenueRecognitionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProductType_])
    async mjBizAppsOrdersProductTypes_DefaultRevenueRecognitionTypeIDArray(@Root() mjbizappsordersrevenuerecognitiontype_: mjBizAppsOrdersRevenueRecognitionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductTypes')} WHERE ${provider.QuoteIdentifier('DefaultRevenueRecognitionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersrevenuerecognitiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Types', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersRevenueRecognitionType_)
    async CreatemjBizAppsOrdersRevenueRecognitionType(
        @Arg('input', () => CreatemjBizAppsOrdersRevenueRecognitionTypeInput) input: CreatemjBizAppsOrdersRevenueRecognitionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Revenue Recognition Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersRevenueRecognitionType_)
    async UpdatemjBizAppsOrdersRevenueRecognitionType(
        @Arg('input', () => UpdatemjBizAppsOrdersRevenueRecognitionTypeInput) input: UpdatemjBizAppsOrdersRevenueRecognitionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Revenue Recognition Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersRevenueRecognitionType_)
    async DeletemjBizAppsOrdersRevenueRecognitionType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Revenue Recognition Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Sales Authorities
//****************************************************************************
@ObjectType({ description: `Per-rep authority limits (§4.8): the caps within which a sales rep confirms without approval.` })
export class mjBizAppsOrdersSalesAuthority_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    SalesRepUserID: string;
        
    @Field(() => Float, {nullable: true, description: `Maximum discount fraction (0-1) this rep may grant unaided.`}) 
    MaxDiscountPct?: number;
        
    @Field(() => Float, {nullable: true, description: `Maximum order value this rep may confirm unaided.`}) 
    MaxOrderValue?: number;
        
    @Field({nullable: true, description: `JSON array of PaymentTermsType IDs this rep may offer. NULL = all.`}) 
    AllowedPaymentTermsTypeIDs?: string;
        
    @Field({nullable: true, description: `JSON array of ProductCategory IDs this rep may sell. NULL = all.`}) 
    AllowedProductCategoryIDs?: string;
        
    @Field(() => Boolean, {description: `Whether this authority row is in force.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    SalesRepUser: string;
        
    @Field(() => [mjBizAppsOrdersOrderAdjustment_])
    mjBizAppsOrdersOrderAdjustments_AuthorizedBySalesAuthorityIDArray: mjBizAppsOrdersOrderAdjustment_[]; // Link to mjBizAppsOrdersOrderAdjustments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Sales Authorities
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSalesAuthorityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SalesRepUserID?: string;

    @Field(() => Float, { nullable: true })
    MaxDiscountPct: number | null;

    @Field(() => Float, { nullable: true })
    MaxOrderValue: number | null;

    @Field({ nullable: true })
    AllowedPaymentTermsTypeIDs: string | null;

    @Field({ nullable: true })
    AllowedProductCategoryIDs: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Sales Authorities
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSalesAuthorityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SalesRepUserID?: string;

    @Field(() => Float, { nullable: true })
    MaxDiscountPct?: number | null;

    @Field(() => Float, { nullable: true })
    MaxOrderValue?: number | null;

    @Field({ nullable: true })
    AllowedPaymentTermsTypeIDs?: string | null;

    @Field({ nullable: true })
    AllowedProductCategoryIDs?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Sales Authorities
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSalesAuthorityViewResult {
    @Field(() => [mjBizAppsOrdersSalesAuthority_])
    Results: mjBizAppsOrdersSalesAuthority_[];

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

@Resolver(mjBizAppsOrdersSalesAuthority_)
export class mjBizAppsOrdersSalesAuthorityResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSalesAuthorityViewResult)
    async RunmjBizAppsOrdersSalesAuthorityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSalesAuthorityViewResult)
    async RunmjBizAppsOrdersSalesAuthorityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSalesAuthorityViewResult)
    async RunmjBizAppsOrdersSalesAuthorityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Sales Authorities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSalesAuthority_, { nullable: true })
    async mjBizAppsOrdersSalesAuthority(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSalesAuthority_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Sales Authorities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSalesAuthorities')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Sales Authorities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Sales Authorities', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersOrderAdjustment_])
    async mjBizAppsOrdersOrderAdjustments_AuthorizedBySalesAuthorityIDArray(@Root() mjbizappsorderssalesauthority_: mjBizAppsOrdersSalesAuthority_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Adjustments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderAdjustments')} WHERE ${provider.QuoteIdentifier('AuthorizedBySalesAuthorityID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Adjustments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssalesauthority_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Adjustments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersSalesAuthority_)
    async CreatemjBizAppsOrdersSalesAuthority(
        @Arg('input', () => CreatemjBizAppsOrdersSalesAuthorityInput) input: CreatemjBizAppsOrdersSalesAuthorityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Sales Authorities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSalesAuthority_)
    async UpdatemjBizAppsOrdersSalesAuthority(
        @Arg('input', () => UpdatemjBizAppsOrdersSalesAuthorityInput) input: UpdatemjBizAppsOrdersSalesAuthorityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Sales Authorities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSalesAuthority_)
    async DeletemjBizAppsOrdersSalesAuthority(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Sales Authorities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Sales Rules
//****************************************************************************
@ObjectType({ description: `Metadata-driven sales constraint evaluated at Confirm (BO-D17/D18). Violations raise an Approval Request Task routed to ApprovalRequiredRoleID; golden path confirms instantly.` })
export class mjBizAppsOrdersSalesRule_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the rule.`}) 
    @MaxLength(200)
    Name: string;
        
    @Field({description: `DiscountLimit | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom.`}) 
    @MaxLength(40)
    RuleType: string;
        
    @Field({description: `Global | PerProduct | PerCustomer | PerSalesRep — what ScopeReferenceID points at.`}) 
    @MaxLength(40)
    Scope: string;
        
    @Field({nullable: true, description: `Soft reference (no FK) to the scoped Product / Customer Organization / Sales Rep User when Scope is not Global.`}) 
    @MaxLength(36)
    ScopeReferenceID?: string;
        
    @Field({nullable: true, description: `JSON rule expression (admin-editable; evaluated by the F8 engine).`}) 
    PredicateJson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ApprovalRequiredRoleID?: string;
        
    @Field(() => Boolean, {description: `Whether this rule participates in Confirm evaluation.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    ApprovalRequiredRole?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Sales Rules
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSalesRuleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    RuleType?: string;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    ScopeReferenceID: string | null;

    @Field({ nullable: true })
    PredicateJson: string | null;

    @Field({ nullable: true })
    ApprovalRequiredRoleID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Sales Rules
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSalesRuleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    RuleType?: string;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    ScopeReferenceID?: string | null;

    @Field({ nullable: true })
    PredicateJson?: string | null;

    @Field({ nullable: true })
    ApprovalRequiredRoleID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Sales Rules
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSalesRuleViewResult {
    @Field(() => [mjBizAppsOrdersSalesRule_])
    Results: mjBizAppsOrdersSalesRule_[];

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

@Resolver(mjBizAppsOrdersSalesRule_)
export class mjBizAppsOrdersSalesRuleResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSalesRuleViewResult)
    async RunmjBizAppsOrdersSalesRuleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSalesRuleViewResult)
    async RunmjBizAppsOrdersSalesRuleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSalesRuleViewResult)
    async RunmjBizAppsOrdersSalesRuleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Sales Rules';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSalesRule_, { nullable: true })
    async mjBizAppsOrdersSalesRule(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSalesRule_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Sales Rules', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSalesRules')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Sales Rules', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Sales Rules', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersSalesRule_)
    async CreatemjBizAppsOrdersSalesRule(
        @Arg('input', () => CreatemjBizAppsOrdersSalesRuleInput) input: CreatemjBizAppsOrdersSalesRuleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Sales Rules', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSalesRule_)
    async UpdatemjBizAppsOrdersSalesRule(
        @Arg('input', () => UpdatemjBizAppsOrdersSalesRuleInput) input: UpdatemjBizAppsOrdersSalesRuleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Sales Rules', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSalesRule_)
    async DeletemjBizAppsOrdersSalesRule(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Sales Rules', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Stored Value Accounts
//****************************************************************************
@ObjectType({ description: `Gift-card / stored-value instrument (BO-D44). Selling one books a LIABILITY (not revenue); redemption is a Payment with Method=GiftCard relieving the liability.` })
export class mjBizAppsOrdersStoredValueAccount_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The gift-card number / instrument code. Unique.`}) 
    @MaxLength(60)
    Code: string;
        
    @Field() 
    @MaxLength(36)
    IssuingCompanyID: string;
        
    @Field(() => Float, {description: `Face value at issuance.`}) 
    InitialAmount: number;
        
    @Field(() => Float, {description: `Current remaining balance (ledger-maintained via StoredValueTransaction).`}) 
    CurrentBalance: number;
        
    @Field({description: `Active | Depleted | Expired | Suspended | Voided.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    IssuedFromOrderLineID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Person — the card recipient.`}) 
    @MaxLength(36)
    BeneficiaryPersonID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the benefiting organization.`}) 
    @MaxLength(36)
    BeneficiaryOrganizationID?: string;
        
    @Field({nullable: true, description: `Expiration date where legally permitted. NULL = never.`}) 
    ExpiresAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    IssuingCompany: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    BeneficiaryPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    BeneficiaryOrganization?: string;
        
    @Field(() => [mjBizAppsOrdersStoredValueTransaction_])
    mjBizAppsOrdersStoredValueTransactions_StoredValueAccountIDArray: mjBizAppsOrdersStoredValueTransaction_[]; // Link to mjBizAppsOrdersStoredValueTransactions
    
    @Field(() => [mjBizAppsOrdersPaymentDetail_])
    mjBizAppsOrdersPaymentDetails_StoredValueAccountIDArray: mjBizAppsOrdersPaymentDetail_[]; // Link to mjBizAppsOrdersPaymentDetails
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Stored Value Accounts
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersStoredValueAccountInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    IssuingCompanyID?: string;

    @Field(() => Float, { nullable: true })
    InitialAmount?: number;

    @Field(() => Float, { nullable: true })
    CurrentBalance?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    IssuedFromOrderLineID: string | null;

    @Field({ nullable: true })
    BeneficiaryPersonID: string | null;

    @Field({ nullable: true })
    BeneficiaryOrganizationID: string | null;

    @Field({ nullable: true })
    ExpiresAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Stored Value Accounts
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersStoredValueAccountInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    IssuingCompanyID?: string;

    @Field(() => Float, { nullable: true })
    InitialAmount?: number;

    @Field(() => Float, { nullable: true })
    CurrentBalance?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    IssuedFromOrderLineID?: string | null;

    @Field({ nullable: true })
    BeneficiaryPersonID?: string | null;

    @Field({ nullable: true })
    BeneficiaryOrganizationID?: string | null;

    @Field({ nullable: true })
    ExpiresAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Stored Value Accounts
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersStoredValueAccountViewResult {
    @Field(() => [mjBizAppsOrdersStoredValueAccount_])
    Results: mjBizAppsOrdersStoredValueAccount_[];

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

@Resolver(mjBizAppsOrdersStoredValueAccount_)
export class mjBizAppsOrdersStoredValueAccountResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersStoredValueAccountViewResult)
    async RunmjBizAppsOrdersStoredValueAccountViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersStoredValueAccountViewResult)
    async RunmjBizAppsOrdersStoredValueAccountViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersStoredValueAccountViewResult)
    async RunmjBizAppsOrdersStoredValueAccountDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Stored Value Accounts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersStoredValueAccount_, { nullable: true })
    async mjBizAppsOrdersStoredValueAccount(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersStoredValueAccount_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Stored Value Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwStoredValueAccounts')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Stored Value Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Stored Value Accounts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersStoredValueTransaction_])
    async mjBizAppsOrdersStoredValueTransactions_StoredValueAccountIDArray(@Root() mjbizappsordersstoredvalueaccount_: mjBizAppsOrdersStoredValueAccount_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Stored Value Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwStoredValueTransactions')} WHERE ${provider.QuoteIdentifier('StoredValueAccountID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Stored Value Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersstoredvalueaccount_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Stored Value Transactions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersPaymentDetail_])
    async mjBizAppsOrdersPaymentDetails_StoredValueAccountIDArray(@Root() mjbizappsordersstoredvalueaccount_: mjBizAppsOrdersStoredValueAccount_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Payment Details', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwPaymentDetails')} WHERE ${provider.QuoteIdentifier('StoredValueAccountID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Payment Details', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsordersstoredvalueaccount_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Payment Details', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersStoredValueAccount_)
    async CreatemjBizAppsOrdersStoredValueAccount(
        @Arg('input', () => CreatemjBizAppsOrdersStoredValueAccountInput) input: CreatemjBizAppsOrdersStoredValueAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Stored Value Accounts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersStoredValueAccount_)
    async UpdatemjBizAppsOrdersStoredValueAccount(
        @Arg('input', () => UpdatemjBizAppsOrdersStoredValueAccountInput) input: UpdatemjBizAppsOrdersStoredValueAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Stored Value Accounts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersStoredValueAccount_)
    async DeletemjBizAppsOrdersStoredValueAccount(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Stored Value Accounts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Stored Value Transactions
//****************************************************************************
@ObjectType({ description: `Stored-value balance ledger (BO-D44): every issue/redeem/refund/adjust/expire with the running balance.` })
export class mjBizAppsOrdersStoredValueTransaction_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    StoredValueAccountID: string;
        
    @Field({description: `Issue | Redeem | Refund | Adjust | Expire.`}) 
    @MaxLength(20)
    TransactionType: string;
        
    @Field(() => Float, {description: `Signed amount (+issue/refund, -redeem/expire).`}) 
    Amount: number;
        
    @Field(() => Float, {description: `Account balance after applying this transaction.`}) 
    BalanceAfter: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RelatedPaymentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RelatedOrderHeaderID?: string;
        
    @Field({description: `UTC timestamp of the transaction.`}) 
    OccurredAt: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Stored Value Transactions
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersStoredValueTransactionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    StoredValueAccountID?: string;

    @Field({ nullable: true })
    TransactionType?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    BalanceAfter?: number;

    @Field({ nullable: true })
    RelatedPaymentID: string | null;

    @Field({ nullable: true })
    RelatedOrderHeaderID: string | null;

    @Field({ nullable: true })
    OccurredAt?: Date;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Stored Value Transactions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersStoredValueTransactionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    StoredValueAccountID?: string;

    @Field({ nullable: true })
    TransactionType?: string;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Float, { nullable: true })
    BalanceAfter?: number;

    @Field({ nullable: true })
    RelatedPaymentID?: string | null;

    @Field({ nullable: true })
    RelatedOrderHeaderID?: string | null;

    @Field({ nullable: true })
    OccurredAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Stored Value Transactions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersStoredValueTransactionViewResult {
    @Field(() => [mjBizAppsOrdersStoredValueTransaction_])
    Results: mjBizAppsOrdersStoredValueTransaction_[];

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

@Resolver(mjBizAppsOrdersStoredValueTransaction_)
export class mjBizAppsOrdersStoredValueTransactionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersStoredValueTransactionViewResult)
    async RunmjBizAppsOrdersStoredValueTransactionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersStoredValueTransactionViewResult)
    async RunmjBizAppsOrdersStoredValueTransactionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersStoredValueTransactionViewResult)
    async RunmjBizAppsOrdersStoredValueTransactionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Stored Value Transactions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersStoredValueTransaction_, { nullable: true })
    async mjBizAppsOrdersStoredValueTransaction(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersStoredValueTransaction_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Stored Value Transactions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwStoredValueTransactions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Stored Value Transactions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Stored Value Transactions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersStoredValueTransaction_)
    async CreatemjBizAppsOrdersStoredValueTransaction(
        @Arg('input', () => CreatemjBizAppsOrdersStoredValueTransactionInput) input: CreatemjBizAppsOrdersStoredValueTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Stored Value Transactions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersStoredValueTransaction_)
    async UpdatemjBizAppsOrdersStoredValueTransaction(
        @Arg('input', () => UpdatemjBizAppsOrdersStoredValueTransactionInput) input: UpdatemjBizAppsOrdersStoredValueTransactionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Stored Value Transactions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersStoredValueTransaction_)
    async DeletemjBizAppsOrdersStoredValueTransaction(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Stored Value Transactions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Subscription Events
//****************************************************************************
@ObjectType({ description: `Immutable subscription lifecycle log (§4.4). One row per event; EventData carries the JSON payload.` })
export class mjBizAppsOrdersSubscriptionEvent_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    SubscriptionID: string;
        
    @Field({description: `The lifecycle event kind (Created ... RenewalOrderSpawned).`}) 
    @MaxLength(40)
    EventType: string;
        
    @Field({description: `UTC timestamp the event occurred.`}) 
    OccurredAt: Date;
        
    @Field({nullable: true, description: `JSON event payload (provider webhook body or internal context).`}) 
    EventData?: string;
        
    @Field({nullable: true, description: `Provider webhook event id — the idempotency key (unique when present).`}) 
    @MaxLength(100)
    ProviderEventID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RelatedPaymentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RelatedOrderHeaderID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Events
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSubscriptionEventInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SubscriptionID?: string;

    @Field({ nullable: true })
    EventType?: string;

    @Field({ nullable: true })
    OccurredAt?: Date;

    @Field({ nullable: true })
    EventData: string | null;

    @Field({ nullable: true })
    ProviderEventID: string | null;

    @Field({ nullable: true })
    RelatedPaymentID: string | null;

    @Field({ nullable: true })
    RelatedOrderHeaderID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Events
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSubscriptionEventInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SubscriptionID?: string;

    @Field({ nullable: true })
    EventType?: string;

    @Field({ nullable: true })
    OccurredAt?: Date;

    @Field({ nullable: true })
    EventData?: string | null;

    @Field({ nullable: true })
    ProviderEventID?: string | null;

    @Field({ nullable: true })
    RelatedPaymentID?: string | null;

    @Field({ nullable: true })
    RelatedOrderHeaderID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Subscription Events
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSubscriptionEventViewResult {
    @Field(() => [mjBizAppsOrdersSubscriptionEvent_])
    Results: mjBizAppsOrdersSubscriptionEvent_[];

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

@Resolver(mjBizAppsOrdersSubscriptionEvent_)
export class mjBizAppsOrdersSubscriptionEventResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSubscriptionEventViewResult)
    async RunmjBizAppsOrdersSubscriptionEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionEventViewResult)
    async RunmjBizAppsOrdersSubscriptionEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionEventViewResult)
    async RunmjBizAppsOrdersSubscriptionEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Subscription Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSubscriptionEvent_, { nullable: true })
    async mjBizAppsOrdersSubscriptionEvent(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSubscriptionEvent_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionEvents')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Events', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionEvent_)
    async CreatemjBizAppsOrdersSubscriptionEvent(
        @Arg('input', () => CreatemjBizAppsOrdersSubscriptionEventInput) input: CreatemjBizAppsOrdersSubscriptionEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Subscription Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSubscriptionEvent_)
    async UpdatemjBizAppsOrdersSubscriptionEvent(
        @Arg('input', () => UpdatemjBizAppsOrdersSubscriptionEventInput) input: UpdatemjBizAppsOrdersSubscriptionEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Subscription Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionEvent_)
    async DeletemjBizAppsOrdersSubscriptionEvent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Subscription Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Subscription Sequences
//****************************************************************************
@ObjectType({ description: `Global singleton counter (ID=1) minting gap-conscious SUB-{seq} subscription numbers. Consumed only by the entity server.` })
export class mjBizAppsOrdersSubscriptionSequence_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {description: `The next subscription sequence number to assign.`}) 
    NextSequenceNumber: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Sequences
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSubscriptionSequenceInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    NextSequenceNumber?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Sequences
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSubscriptionSequenceInput {
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
// RESOLVER for MJ_BizApps_Orders: Subscription Sequences
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSubscriptionSequenceViewResult {
    @Field(() => [mjBizAppsOrdersSubscriptionSequence_])
    Results: mjBizAppsOrdersSubscriptionSequence_[];

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

@Resolver(mjBizAppsOrdersSubscriptionSequence_)
export class mjBizAppsOrdersSubscriptionSequenceResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSubscriptionSequenceViewResult)
    async RunmjBizAppsOrdersSubscriptionSequenceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionSequenceViewResult)
    async RunmjBizAppsOrdersSubscriptionSequenceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionSequenceViewResult)
    async RunmjBizAppsOrdersSubscriptionSequenceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Subscription Sequences';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSubscriptionSequence_, { nullable: true })
    async mjBizAppsOrdersSubscriptionSequence(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSubscriptionSequence_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Sequences', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionSequences')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Sequences', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Sequences', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionSequence_)
    async CreatemjBizAppsOrdersSubscriptionSequence(
        @Arg('input', () => CreatemjBizAppsOrdersSubscriptionSequenceInput) input: CreatemjBizAppsOrdersSubscriptionSequenceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Subscription Sequences', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSubscriptionSequence_)
    async UpdatemjBizAppsOrdersSubscriptionSequence(
        @Arg('input', () => UpdatemjBizAppsOrdersSubscriptionSequenceInput) input: UpdatemjBizAppsOrdersSubscriptionSequenceInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Subscription Sequences', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionSequence_)
    async DeletemjBizAppsOrdersSubscriptionSequence(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Subscription Sequences', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Subscription Terms
//****************************************************************************
@ObjectType()
export class mjBizAppsOrdersSubscriptionTerm_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    SubscriptionID: string;
        
    @Field(() => Int) 
    TermNumber: number;
        
    @Field() 
    @MaxLength(36)
    OrderLineID: string;
        
    @Field() 
    StartDate: Date;
        
    @Field() 
    EndDate: Date;
        
    @Field(() => Float) 
    Amount: number;
        
    @Field(() => Boolean) 
    IsProrated: boolean;
        
    @Field(() => Float, {nullable: true}) 
    ProrationFactor?: number;
        
    @Field() 
    @MaxLength(36)
    RevenueRecognitionTypeID: string;
        
    @Field() 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    CanceledAt?: Date;
        
    @Field({nullable: true}) 
    CancellationEffectiveDate?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(200)
    RevenueRecognitionType: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Terms
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSubscriptionTermInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SubscriptionID?: string;

    @Field(() => Int, { nullable: true })
    TermNumber?: number;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Boolean, { nullable: true })
    IsProrated?: boolean;

    @Field(() => Float, { nullable: true })
    ProrationFactor: number | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CanceledAt: Date | null;

    @Field({ nullable: true })
    CancellationEffectiveDate: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Terms
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSubscriptionTermInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SubscriptionID?: string;

    @Field(() => Int, { nullable: true })
    TermNumber?: number;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    EndDate?: Date;

    @Field(() => Float, { nullable: true })
    Amount?: number;

    @Field(() => Boolean, { nullable: true })
    IsProrated?: boolean;

    @Field(() => Float, { nullable: true })
    ProrationFactor?: number | null;

    @Field({ nullable: true })
    RevenueRecognitionTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CanceledAt?: Date | null;

    @Field({ nullable: true })
    CancellationEffectiveDate?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Subscription Terms
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSubscriptionTermViewResult {
    @Field(() => [mjBizAppsOrdersSubscriptionTerm_])
    Results: mjBizAppsOrdersSubscriptionTerm_[];

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

@Resolver(mjBizAppsOrdersSubscriptionTerm_)
export class mjBizAppsOrdersSubscriptionTermResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSubscriptionTermViewResult)
    async RunmjBizAppsOrdersSubscriptionTermViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionTermViewResult)
    async RunmjBizAppsOrdersSubscriptionTermViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionTermViewResult)
    async RunmjBizAppsOrdersSubscriptionTermDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Subscription Terms';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSubscriptionTerm_, { nullable: true })
    async mjBizAppsOrdersSubscriptionTerm(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSubscriptionTerm_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Terms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionTerms')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Terms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Terms', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionTerm_)
    async CreatemjBizAppsOrdersSubscriptionTerm(
        @Arg('input', () => CreatemjBizAppsOrdersSubscriptionTermInput) input: CreatemjBizAppsOrdersSubscriptionTermInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Subscription Terms', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSubscriptionTerm_)
    async UpdatemjBizAppsOrdersSubscriptionTerm(
        @Arg('input', () => UpdatemjBizAppsOrdersSubscriptionTermInput) input: UpdatemjBizAppsOrdersSubscriptionTermInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Subscription Terms', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionTerm_)
    async DeletemjBizAppsOrdersSubscriptionTerm(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Subscription Terms', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Subscription Types
//****************************************************************************
@ObjectType()
export class mjBizAppsOrdersSubscriptionType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(40)
    Code: string;
        
    @Field() 
    @MaxLength(200)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    DriverClass?: string;
        
    @Field() 
    @MaxLength(20)
    SubscriberScope: string;
        
    @Field() 
    @MaxLength(30)
    BenefitModel: string;
        
    @Field() 
    @MaxLength(20)
    StartMode: string;
        
    @Field(() => Int, {nullable: true}) 
    DeferredStartDays?: number;
        
    @Field(() => Int, {nullable: true}) 
    AnchorMonth?: number;
        
    @Field(() => Int, {nullable: true}) 
    AnchorDay?: number;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    PartialPeriodMode?: string;
        
    @Field(() => Int, {nullable: true}) 
    DefaultTermMonths?: number;
        
    @Field() 
    @MaxLength(20)
    BillingCadence: string;
        
    @Field() 
    @MaxLength(20)
    RecognitionCadence: string;
        
    @Field(() => Int, {nullable: true}) 
    CustomCycleDays?: number;
        
    @Field(() => Int) 
    TrialDays: number;
        
    @Field() 
    @MaxLength(20)
    ConcurrencyMode: string;
        
    @Field() 
    @MaxLength(30)
    ReactivationMode: string;
        
    @Field(() => Int, {nullable: true}) 
    ReactivationWindowDays?: number;
        
    @Field(() => Boolean) 
    AutoRenewDefault: boolean;
        
    @Field(() => Int, {nullable: true}) 
    RenewalLeadDays?: number;
        
    @Field() 
    @MaxLength(20)
    CancellationMode: string;
        
    @Field() 
    @MaxLength(30)
    CancellationRefundMode: string;
        
    @Field(() => Int, {nullable: true}) 
    CancellationWindowDays?: number;
        
    @Field(() => Int) 
    GracePeriodDays: number;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsOrdersProductType_])
    mjBizAppsOrdersProductTypes_DefaultSubscriptionTypeIDArray: mjBizAppsOrdersProductType_[]; // Link to mjBizAppsOrdersProductTypes
    
    @Field(() => [mjBizAppsOrdersProduct_])
    mjBizAppsOrdersProducts_SubscriptionTypeIDArray: mjBizAppsOrdersProduct_[]; // Link to mjBizAppsOrdersProducts
    
    @Field(() => [mjBizAppsOrdersSubscription_])
    mjBizAppsOrdersSubscriptions_SubscriptionTypeIDArray: mjBizAppsOrdersSubscription_[]; // Link to mjBizAppsOrdersSubscriptions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSubscriptionTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    DriverClass: string | null;

    @Field({ nullable: true })
    SubscriberScope?: string;

    @Field({ nullable: true })
    BenefitModel?: string;

    @Field({ nullable: true })
    StartMode?: string;

    @Field(() => Int, { nullable: true })
    DeferredStartDays: number | null;

    @Field(() => Int, { nullable: true })
    AnchorMonth: number | null;

    @Field(() => Int, { nullable: true })
    AnchorDay: number | null;

    @Field({ nullable: true })
    PartialPeriodMode: string | null;

    @Field(() => Int, { nullable: true })
    DefaultTermMonths: number | null;

    @Field({ nullable: true })
    BillingCadence?: string;

    @Field({ nullable: true })
    RecognitionCadence?: string;

    @Field(() => Int, { nullable: true })
    CustomCycleDays: number | null;

    @Field(() => Int, { nullable: true })
    TrialDays?: number;

    @Field({ nullable: true })
    ConcurrencyMode?: string;

    @Field({ nullable: true })
    ReactivationMode?: string;

    @Field(() => Int, { nullable: true })
    ReactivationWindowDays: number | null;

    @Field(() => Boolean, { nullable: true })
    AutoRenewDefault?: boolean;

    @Field(() => Int, { nullable: true })
    RenewalLeadDays: number | null;

    @Field({ nullable: true })
    CancellationMode?: string;

    @Field({ nullable: true })
    CancellationRefundMode?: string;

    @Field(() => Int, { nullable: true })
    CancellationWindowDays: number | null;

    @Field(() => Int, { nullable: true })
    GracePeriodDays?: number;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscription Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSubscriptionTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    DriverClass?: string | null;

    @Field({ nullable: true })
    SubscriberScope?: string;

    @Field({ nullable: true })
    BenefitModel?: string;

    @Field({ nullable: true })
    StartMode?: string;

    @Field(() => Int, { nullable: true })
    DeferredStartDays?: number | null;

    @Field(() => Int, { nullable: true })
    AnchorMonth?: number | null;

    @Field(() => Int, { nullable: true })
    AnchorDay?: number | null;

    @Field({ nullable: true })
    PartialPeriodMode?: string | null;

    @Field(() => Int, { nullable: true })
    DefaultTermMonths?: number | null;

    @Field({ nullable: true })
    BillingCadence?: string;

    @Field({ nullable: true })
    RecognitionCadence?: string;

    @Field(() => Int, { nullable: true })
    CustomCycleDays?: number | null;

    @Field(() => Int, { nullable: true })
    TrialDays?: number;

    @Field({ nullable: true })
    ConcurrencyMode?: string;

    @Field({ nullable: true })
    ReactivationMode?: string;

    @Field(() => Int, { nullable: true })
    ReactivationWindowDays?: number | null;

    @Field(() => Boolean, { nullable: true })
    AutoRenewDefault?: boolean;

    @Field(() => Int, { nullable: true })
    RenewalLeadDays?: number | null;

    @Field({ nullable: true })
    CancellationMode?: string;

    @Field({ nullable: true })
    CancellationRefundMode?: string;

    @Field(() => Int, { nullable: true })
    CancellationWindowDays?: number | null;

    @Field(() => Int, { nullable: true })
    GracePeriodDays?: number;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Subscription Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSubscriptionTypeViewResult {
    @Field(() => [mjBizAppsOrdersSubscriptionType_])
    Results: mjBizAppsOrdersSubscriptionType_[];

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

@Resolver(mjBizAppsOrdersSubscriptionType_)
export class mjBizAppsOrdersSubscriptionTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSubscriptionTypeViewResult)
    async RunmjBizAppsOrdersSubscriptionTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionTypeViewResult)
    async RunmjBizAppsOrdersSubscriptionTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionTypeViewResult)
    async RunmjBizAppsOrdersSubscriptionTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Subscription Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSubscriptionType_, { nullable: true })
    async mjBizAppsOrdersSubscriptionType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSubscriptionType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersProductType_])
    async mjBizAppsOrdersProductTypes_DefaultSubscriptionTypeIDArray(@Root() mjbizappsorderssubscriptiontype_: mjBizAppsOrdersSubscriptionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Product Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProductTypes')} WHERE ${provider.QuoteIdentifier('DefaultSubscriptionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Product Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscriptiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Product Types', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersProduct_])
    async mjBizAppsOrdersProducts_SubscriptionTypeIDArray(@Root() mjbizappsorderssubscriptiontype_: mjBizAppsOrdersSubscriptionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwProducts')} WHERE ${provider.QuoteIdentifier('SubscriptionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscriptiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Products', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscription_])
    async mjBizAppsOrdersSubscriptions_SubscriptionTypeIDArray(@Root() mjbizappsorderssubscriptiontype_: mjBizAppsOrdersSubscriptionType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('SubscriptionTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscriptiontype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersSubscriptionType_)
    async CreatemjBizAppsOrdersSubscriptionType(
        @Arg('input', () => CreatemjBizAppsOrdersSubscriptionTypeInput) input: CreatemjBizAppsOrdersSubscriptionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Subscription Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSubscriptionType_)
    async UpdatemjBizAppsOrdersSubscriptionType(
        @Arg('input', () => UpdatemjBizAppsOrdersSubscriptionTypeInput) input: UpdatemjBizAppsOrdersSubscriptionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Subscription Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSubscriptionType_)
    async DeletemjBizAppsOrdersSubscriptionType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Subscription Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Orders: Subscriptions
//****************************************************************************
@ObjectType({ description: `A recurring (Product, Customer, Beneficiary) relationship born from an order line (D20/D27). Renewal cycles spawn new Orders under it (Draft at launch, D20); schedules hang off order lines, not here.` })
export class mjBizAppsOrdersSubscription_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable subscription identifier. Unique.`}) 
    @MaxLength(40)
    SubscriptionNumber: string;
        
    @Field({description: `The company whose product this subscription continues — stamped from Product.CompanyID at creation (D6). FK to __mj.Company.`}) 
    @MaxLength(36)
    CompanyID: string;
        
    @Field() 
    @MaxLength(36)
    OrderLineID: string;
        
    @Field() 
    @MaxLength(36)
    SubscriptionTypeID: string;
        
    @Field() 
    @MaxLength(36)
    ProductID: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Organization — the organization HOLDING this subscription (D65), fed from the order line's ship-to and possibly different from whoever paid.`}) 
    @MaxLength(36)
    HolderOrganizationID?: string;
        
    @Field({nullable: true, description: `FK to __mj_BizAppsCommon.Person — who benefits (the member/seat), when distinct from the payer (BO-D39).`}) 
    @MaxLength(36)
    BeneficiaryPersonID?: string;
        
    @Field({description: `Active | Paused | Canceled | Migrated | Trialing.`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({description: `Date the subscription began.`}) 
    StartDate: Date;
        
    @Field({nullable: true, description: `When the trial ends (Trialing status).`}) 
    TrialEndDate?: Date;
        
    @Field({nullable: true, description: `UTC timestamp the cancellation was recorded.`}) 
    CanceledAt?: Date;
        
    @Field({nullable: true, description: `Final service date after cancellation/migration.`}) 
    EndDate?: Date;
        
    @Field(() => Boolean, {description: `Whether renewal orders spawn automatically (Jeremy: auto-renew flag).`}) 
    AutoRenew: boolean;
        
    @Field(() => Int, {nullable: true, description: `How many days before CurrentPeriodEnd the renewal order is raised (Jeremy: invoice about three months ahead).`}) 
    RenewalLeadDays?: number;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PaymentProviderID?: string;
        
    @Field({nullable: true, description: `Provider-side subscription identifier (e.g. Stripe sub_...), when provider-billed.`}) 
    @MaxLength(100)
    ProviderSubscriptionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MigratesFromSubscriptionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    MigratesToSubscriptionID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(50)
    Company: string;
        
    @Field() 
    @MaxLength(200)
    SubscriptionType: string;
        
    @Field() 
    @MaxLength(200)
    Product: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    HolderOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(244)
    BeneficiaryPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    PaymentProvider?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootMigratesFromSubscriptionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootMigratesToSubscriptionID?: string;
        
    @Field(() => [mjBizAppsOrdersSubscription_])
    mjBizAppsOrdersSubscriptions_MigratesFromSubscriptionIDArray: mjBizAppsOrdersSubscription_[]; // Link to mjBizAppsOrdersSubscriptions
    
    @Field(() => [mjBizAppsOrdersSubscription_])
    mjBizAppsOrdersSubscriptions_MigratesToSubscriptionIDArray: mjBizAppsOrdersSubscription_[]; // Link to mjBizAppsOrdersSubscriptions
    
    @Field(() => [mjBizAppsOrdersSubscriptionEvent_])
    mjBizAppsOrdersSubscriptionEvents_SubscriptionIDArray: mjBizAppsOrdersSubscriptionEvent_[]; // Link to mjBizAppsOrdersSubscriptionEvents
    
    @Field(() => [mjBizAppsOrdersOrderLine_])
    mjBizAppsOrdersOrderLines_SubscriptionIDArray: mjBizAppsOrdersOrderLine_[]; // Link to mjBizAppsOrdersOrderLines
    
    @Field(() => [mjBizAppsOrdersSubscriptionTerm_])
    mjBizAppsOrdersSubscriptionTerms_SubscriptionIDArray: mjBizAppsOrdersSubscriptionTerm_[]; // Link to mjBizAppsOrdersSubscriptionTerms
    
    @Field(() => [mjBizAppsOrdersEntitlementGrant_])
    mjBizAppsOrdersEntitlementGrants_SubscriptionIDArray: mjBizAppsOrdersEntitlementGrant_[]; // Link to mjBizAppsOrdersEntitlementGrants
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscriptions
//****************************************************************************
@InputType()
export class CreatemjBizAppsOrdersSubscriptionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    SubscriptionNumber?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field({ nullable: true })
    SubscriptionTypeID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    HolderOrganizationID: string | null;

    @Field({ nullable: true })
    BeneficiaryPersonID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    TrialEndDate: Date | null;

    @Field({ nullable: true })
    CanceledAt: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field(() => Boolean, { nullable: true })
    AutoRenew?: boolean;

    @Field(() => Int, { nullable: true })
    RenewalLeadDays: number | null;

    @Field({ nullable: true })
    PaymentProviderID: string | null;

    @Field({ nullable: true })
    ProviderSubscriptionID: string | null;

    @Field({ nullable: true })
    MigratesFromSubscriptionID: string | null;

    @Field({ nullable: true })
    MigratesToSubscriptionID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Orders: Subscriptions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsOrdersSubscriptionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    SubscriptionNumber?: string;

    @Field({ nullable: true })
    CompanyID?: string;

    @Field({ nullable: true })
    OrderLineID?: string;

    @Field({ nullable: true })
    SubscriptionTypeID?: string;

    @Field({ nullable: true })
    ProductID?: string;

    @Field({ nullable: true })
    HolderOrganizationID?: string | null;

    @Field({ nullable: true })
    BeneficiaryPersonID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StartDate?: Date;

    @Field({ nullable: true })
    TrialEndDate?: Date | null;

    @Field({ nullable: true })
    CanceledAt?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field(() => Boolean, { nullable: true })
    AutoRenew?: boolean;

    @Field(() => Int, { nullable: true })
    RenewalLeadDays?: number | null;

    @Field({ nullable: true })
    PaymentProviderID?: string | null;

    @Field({ nullable: true })
    ProviderSubscriptionID?: string | null;

    @Field({ nullable: true })
    MigratesFromSubscriptionID?: string | null;

    @Field({ nullable: true })
    MigratesToSubscriptionID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Orders: Subscriptions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsOrdersSubscriptionViewResult {
    @Field(() => [mjBizAppsOrdersSubscription_])
    Results: mjBizAppsOrdersSubscription_[];

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

@Resolver(mjBizAppsOrdersSubscription_)
export class mjBizAppsOrdersSubscriptionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsOrdersSubscriptionViewResult)
    async RunmjBizAppsOrdersSubscriptionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionViewResult)
    async RunmjBizAppsOrdersSubscriptionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsOrdersSubscriptionViewResult)
    async RunmjBizAppsOrdersSubscriptionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Orders: Subscriptions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsOrdersSubscription_, { nullable: true })
    async mjBizAppsOrdersSubscription(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsOrdersSubscription_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsOrdersSubscription_])
    async mjBizAppsOrdersSubscriptions_MigratesFromSubscriptionIDArray(@Root() mjbizappsorderssubscription_: mjBizAppsOrdersSubscription_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('MigratesFromSubscriptionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscription_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscription_])
    async mjBizAppsOrdersSubscriptions_MigratesToSubscriptionIDArray(@Root() mjbizappsorderssubscription_: mjBizAppsOrdersSubscription_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptions')} WHERE ${provider.QuoteIdentifier('MigratesToSubscriptionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscription_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscriptions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscriptionEvent_])
    async mjBizAppsOrdersSubscriptionEvents_SubscriptionIDArray(@Root() mjbizappsorderssubscription_: mjBizAppsOrdersSubscription_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionEvents')} WHERE ${provider.QuoteIdentifier('SubscriptionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscription_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Events', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersOrderLine_])
    async mjBizAppsOrdersOrderLines_SubscriptionIDArray(@Root() mjbizappsorderssubscription_: mjBizAppsOrdersSubscription_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Order Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwOrderLines')} WHERE ${provider.QuoteIdentifier('SubscriptionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Order Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscription_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Order Lines', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersSubscriptionTerm_])
    async mjBizAppsOrdersSubscriptionTerms_SubscriptionIDArray(@Root() mjbizappsorderssubscription_: mjBizAppsOrdersSubscription_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Subscription Terms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwSubscriptionTerms')} WHERE ${provider.QuoteIdentifier('SubscriptionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Subscription Terms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscription_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Subscription Terms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsOrdersEntitlementGrant_])
    async mjBizAppsOrdersEntitlementGrants_SubscriptionIDArray(@Root() mjbizappsorderssubscription_: mjBizAppsOrdersSubscription_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Orders: Entitlement Grants', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsOrders', 'vwEntitlementGrants')} WHERE ${provider.QuoteIdentifier('SubscriptionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Orders: Entitlement Grants', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsorderssubscription_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Orders: Entitlement Grants', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsOrdersSubscription_)
    async CreatemjBizAppsOrdersSubscription(
        @Arg('input', () => CreatemjBizAppsOrdersSubscriptionInput) input: CreatemjBizAppsOrdersSubscriptionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Orders: Subscriptions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsOrdersSubscription_)
    async UpdatemjBizAppsOrdersSubscription(
        @Arg('input', () => UpdatemjBizAppsOrdersSubscriptionInput) input: UpdatemjBizAppsOrdersSubscriptionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Orders: Subscriptions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsOrdersSubscription_)
    async DeletemjBizAppsOrdersSubscription(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Orders: Subscriptions', key, options, provider, userPayload, pubSub);
    }
    
}
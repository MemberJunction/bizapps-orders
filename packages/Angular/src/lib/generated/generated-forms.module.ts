/**********************************************************************************
* GENERATED FILE - This file is automatically managed by the MJ CodeGen tool, 
* 
* DO NOT MODIFY THIS FILE - any changes you make will be wiped out the next time the file is
* generated
* 
**********************************************************************************/
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction Imports
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

// Import Generated Components
import { mjBizAppsOrdersChargeTypeFormComponent } from "./Entities/mjBizAppsOrdersChargeType/mjbizappsorderschargetype.form.component";
import { mjBizAppsOrdersCustomerPaymentMethodFormComponent } from "./Entities/mjBizAppsOrdersCustomerPaymentMethod/mjbizappsorderscustomerpaymentmethod.form.component";
import { mjBizAppsOrdersCustomerTaxExemptionFormComponent } from "./Entities/mjBizAppsOrdersCustomerTaxExemption/mjbizappsorderscustomertaxexemption.form.component";
import { mjBizAppsOrdersEntitlementGrantFormComponent } from "./Entities/mjBizAppsOrdersEntitlementGrant/mjbizappsordersentitlementgrant.form.component";
import { mjBizAppsOrdersEventOrderLineFormComponent } from "./Entities/mjBizAppsOrdersEventOrderLine/mjbizappsorderseventorderline.form.component";
import { mjBizAppsOrdersEventProductFormComponent } from "./Entities/mjBizAppsOrdersEventProduct/mjbizappsorderseventproduct.form.component";
import { mjBizAppsOrdersOrderAdjustmentAllocationFormComponent } from "./Entities/mjBizAppsOrdersOrderAdjustmentAllocation/mjbizappsordersorderadjustmentallocation.form.component";
import { mjBizAppsOrdersOrderAdjustmentFormComponent } from "./Entities/mjBizAppsOrdersOrderAdjustment/mjbizappsordersorderadjustment.form.component";
import { mjBizAppsOrdersOrderChargeAllocationFormComponent } from "./Entities/mjBizAppsOrdersOrderChargeAllocation/mjbizappsordersorderchargeallocation.form.component";
import { mjBizAppsOrdersOrderChargeFormComponent } from "./Entities/mjBizAppsOrdersOrderCharge/mjbizappsordersordercharge.form.component";
import { mjBizAppsOrdersOrderCompanyPolicyFormComponent } from "./Entities/mjBizAppsOrdersOrderCompanyPolicy/mjbizappsordersordercompanypolicy.form.component";
import { mjBizAppsOrdersOrderHeaderFormComponent } from "./Entities/mjBizAppsOrdersOrderHeader/mjbizappsordersorderheader.form.component";
import { mjBizAppsOrdersOrderLineDimensionFormComponent } from "./Entities/mjBizAppsOrdersOrderLineDimension/mjbizappsordersorderlinedimension.form.component";
import { mjBizAppsOrdersOrderLinePriceComponentFormComponent } from "./Entities/mjBizAppsOrdersOrderLinePriceComponent/mjbizappsordersorderlinepricecomponent.form.component";
import { mjBizAppsOrdersOrderLineFormComponent } from "./Entities/mjBizAppsOrdersOrderLine/mjbizappsordersorderline.form.component";
import { mjBizAppsOrdersOrderSequenceFormComponent } from "./Entities/mjBizAppsOrdersOrderSequence/mjbizappsordersordersequence.form.component";
import { mjBizAppsOrdersPaymentDetailFormComponent } from "./Entities/mjBizAppsOrdersPaymentDetail/mjbizappsorderspaymentdetail.form.component";
import { mjBizAppsOrdersPaymentHeaderFormComponent } from "./Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component";
import { mjBizAppsOrdersPaymentIntentFormComponent } from "./Entities/mjBizAppsOrdersPaymentIntent/mjbizappsorderspaymentintent.form.component";
import { mjBizAppsOrdersPaymentLineFormComponent } from "./Entities/mjBizAppsOrdersPaymentLine/mjbizappsorderspaymentline.form.component";
import { mjBizAppsOrdersPaymentProviderTypeFormComponent } from "./Entities/mjBizAppsOrdersPaymentProviderType/mjbizappsorderspaymentprovidertype.form.component";
import { mjBizAppsOrdersPaymentProviderFormComponent } from "./Entities/mjBizAppsOrdersPaymentProvider/mjbizappsorderspaymentprovider.form.component";
import { mjBizAppsOrdersPaymentSequenceFormComponent } from "./Entities/mjBizAppsOrdersPaymentSequence/mjbizappsorderspaymentsequence.form.component";
import { mjBizAppsOrdersPaymentTermsTypeFormComponent } from "./Entities/mjBizAppsOrdersPaymentTermsType/mjbizappsorderspaymenttermstype.form.component";
import { mjBizAppsOrdersPaymentTypeFormComponent } from "./Entities/mjBizAppsOrdersPaymentType/mjbizappsorderspaymenttype.form.component";
import { mjBizAppsOrdersPriceListAssignmentFormComponent } from "./Entities/mjBizAppsOrdersPriceListAssignment/mjbizappsorderspricelistassignment.form.component";
import { mjBizAppsOrdersPriceListFormComponent } from "./Entities/mjBizAppsOrdersPriceList/mjbizappsorderspricelist.form.component";
import { mjBizAppsOrdersPriceTierFormComponent } from "./Entities/mjBizAppsOrdersPriceTier/mjbizappsorderspricetier.form.component";
import { mjBizAppsOrdersProductBundleItemFormComponent } from "./Entities/mjBizAppsOrdersProductBundleItem/mjbizappsordersproductbundleitem.form.component";
import { mjBizAppsOrdersProductCategoryFormComponent } from "./Entities/mjBizAppsOrdersProductCategory/mjbizappsordersproductcategory.form.component";
import { mjBizAppsOrdersProductEntitlementFormComponent } from "./Entities/mjBizAppsOrdersProductEntitlement/mjbizappsordersproductentitlement.form.component";
import { mjBizAppsOrdersProductPerformanceObligationFormComponent } from "./Entities/mjBizAppsOrdersProductPerformanceObligation/mjbizappsordersproductperformanceobligation.form.component";
import { mjBizAppsOrdersProductPriceFormComponent } from "./Entities/mjBizAppsOrdersProductPrice/mjbizappsordersproductprice.form.component";
import { mjBizAppsOrdersProductTypeFormComponent } from "./Entities/mjBizAppsOrdersProductType/mjbizappsordersproducttype.form.component";
import { mjBizAppsOrdersProductFormComponent } from "./Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component";
import { mjBizAppsOrdersPromotionCodeFormComponent } from "./Entities/mjBizAppsOrdersPromotionCode/mjbizappsorderspromotioncode.form.component";
import { mjBizAppsOrdersPromotionTargetFormComponent } from "./Entities/mjBizAppsOrdersPromotionTarget/mjbizappsorderspromotiontarget.form.component";
import { mjBizAppsOrdersPromotionTypeFormComponent } from "./Entities/mjBizAppsOrdersPromotionType/mjbizappsorderspromotiontype.form.component";
import { mjBizAppsOrdersPromotionFormComponent } from "./Entities/mjBizAppsOrdersPromotion/mjbizappsorderspromotion.form.component";
import { mjBizAppsOrdersRevRecScheduleLineFormComponent } from "./Entities/mjBizAppsOrdersRevRecScheduleLine/mjbizappsordersrevrecscheduleline.form.component";
import { mjBizAppsOrdersRevenueRecognitionScheduleFormComponent } from "./Entities/mjBizAppsOrdersRevenueRecognitionSchedule/mjbizappsordersrevenuerecognitionschedule.form.component";
import { mjBizAppsOrdersRevenueRecognitionTypeFormComponent } from "./Entities/mjBizAppsOrdersRevenueRecognitionType/mjbizappsordersrevenuerecognitiontype.form.component";
import { mjBizAppsOrdersSalesAuthorityFormComponent } from "./Entities/mjBizAppsOrdersSalesAuthority/mjbizappsorderssalesauthority.form.component";
import { mjBizAppsOrdersSalesRuleFormComponent } from "./Entities/mjBizAppsOrdersSalesRule/mjbizappsorderssalesrule.form.component";
import { mjBizAppsOrdersStoredValueAccountFormComponent } from "./Entities/mjBizAppsOrdersStoredValueAccount/mjbizappsordersstoredvalueaccount.form.component";
import { mjBizAppsOrdersStoredValueTransactionFormComponent } from "./Entities/mjBizAppsOrdersStoredValueTransaction/mjbizappsordersstoredvaluetransaction.form.component";
import { mjBizAppsOrdersSubscriptionEventFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionEvent/mjbizappsorderssubscriptionevent.form.component";
import { mjBizAppsOrdersSubscriptionSequenceFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionSequence/mjbizappsorderssubscriptionsequence.form.component";
import { mjBizAppsOrdersSubscriptionTermFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionTerm/mjbizappsorderssubscriptionterm.form.component";
import { mjBizAppsOrdersSubscriptionTypeFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionType/mjbizappsorderssubscriptiontype.form.component";
import { mjBizAppsOrdersSubscriptionFormComponent } from "./Entities/mjBizAppsOrdersSubscription/mjbizappsorderssubscription.form.component";
   

@NgModule({
declarations: [
    mjBizAppsOrdersChargeTypeFormComponent,
    mjBizAppsOrdersCustomerPaymentMethodFormComponent,
    mjBizAppsOrdersCustomerTaxExemptionFormComponent,
    mjBizAppsOrdersEntitlementGrantFormComponent,
    mjBizAppsOrdersEventOrderLineFormComponent,
    mjBizAppsOrdersEventProductFormComponent,
    mjBizAppsOrdersOrderAdjustmentAllocationFormComponent,
    mjBizAppsOrdersOrderAdjustmentFormComponent,
    mjBizAppsOrdersOrderChargeAllocationFormComponent,
    mjBizAppsOrdersOrderChargeFormComponent,
    mjBizAppsOrdersOrderCompanyPolicyFormComponent,
    mjBizAppsOrdersOrderHeaderFormComponent,
    mjBizAppsOrdersOrderLineDimensionFormComponent,
    mjBizAppsOrdersOrderLinePriceComponentFormComponent,
    mjBizAppsOrdersOrderLineFormComponent,
    mjBizAppsOrdersOrderSequenceFormComponent,
    mjBizAppsOrdersPaymentDetailFormComponent,
    mjBizAppsOrdersPaymentHeaderFormComponent,
    mjBizAppsOrdersPaymentIntentFormComponent,
    mjBizAppsOrdersPaymentLineFormComponent],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersPaymentProviderTypeFormComponent,
    mjBizAppsOrdersPaymentProviderFormComponent,
    mjBizAppsOrdersPaymentSequenceFormComponent,
    mjBizAppsOrdersPaymentTermsTypeFormComponent,
    mjBizAppsOrdersPaymentTypeFormComponent,
    mjBizAppsOrdersPriceListAssignmentFormComponent,
    mjBizAppsOrdersPriceListFormComponent,
    mjBizAppsOrdersPriceTierFormComponent,
    mjBizAppsOrdersProductBundleItemFormComponent,
    mjBizAppsOrdersProductCategoryFormComponent,
    mjBizAppsOrdersProductEntitlementFormComponent,
    mjBizAppsOrdersProductPerformanceObligationFormComponent,
    mjBizAppsOrdersProductPriceFormComponent,
    mjBizAppsOrdersProductTypeFormComponent,
    mjBizAppsOrdersProductFormComponent,
    mjBizAppsOrdersPromotionCodeFormComponent,
    mjBizAppsOrdersPromotionTargetFormComponent,
    mjBizAppsOrdersPromotionTypeFormComponent,
    mjBizAppsOrdersPromotionFormComponent,
    mjBizAppsOrdersRevRecScheduleLineFormComponent],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersRevenueRecognitionScheduleFormComponent,
    mjBizAppsOrdersRevenueRecognitionTypeFormComponent,
    mjBizAppsOrdersSalesAuthorityFormComponent,
    mjBizAppsOrdersSalesRuleFormComponent,
    mjBizAppsOrdersStoredValueAccountFormComponent,
    mjBizAppsOrdersStoredValueTransactionFormComponent,
    mjBizAppsOrdersSubscriptionEventFormComponent,
    mjBizAppsOrdersSubscriptionSequenceFormComponent,
    mjBizAppsOrdersSubscriptionTermFormComponent,
    mjBizAppsOrdersSubscriptionTypeFormComponent,
    mjBizAppsOrdersSubscriptionFormComponent],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    
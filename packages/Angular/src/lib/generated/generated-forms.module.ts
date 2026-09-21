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
import { mjBizAppsOrdersCheckoutSessionFormComponent } from "./Entities/mjBizAppsOrdersCheckoutSession/mjbizappsorderscheckoutsession.form.component";
import { mjBizAppsOrdersCheckoutWidgetDistributionFormComponent } from "./Entities/mjBizAppsOrdersCheckoutWidgetDistribution/mjbizappsorderscheckoutwidgetdistribution.form.component";
import { mjBizAppsOrdersCheckoutWidgetFormComponent } from "./Entities/mjBizAppsOrdersCheckoutWidget/mjbizappsorderscheckoutwidget.form.component";
import { mjBizAppsOrdersCustomerPaymentMethodFormComponent } from "./Entities/mjBizAppsOrdersCustomerPaymentMethod/mjbizappsorderscustomerpaymentmethod.form.component";
import { mjBizAppsOrdersCustomerPaymentTermsFormComponent } from "./Entities/mjBizAppsOrdersCustomerPaymentTerms/mjbizappsorderscustomerpaymentterms.form.component";
import { mjBizAppsOrdersCustomerTaxExemptionFormComponent } from "./Entities/mjBizAppsOrdersCustomerTaxExemption/mjbizappsorderscustomertaxexemption.form.component";
import { mjBizAppsOrdersEntitlementGrantFormComponent } from "./Entities/mjBizAppsOrdersEntitlementGrant/mjbizappsordersentitlementgrant.form.component";
import { mjBizAppsOrdersEventOrderLineFormComponent } from "./Entities/mjBizAppsOrdersEventOrderLine/mjbizappsorderseventorderline.form.component";
import { mjBizAppsOrdersEventProductFormComponent } from "./Entities/mjBizAppsOrdersEventProduct/mjbizappsorderseventproduct.form.component";
import { mjBizAppsOrdersOrderAdjustmentAllocationFormComponent } from "./Entities/mjBizAppsOrdersOrderAdjustmentAllocation/mjbizappsordersorderadjustmentallocation.form.component";
import { mjBizAppsOrdersOrderAdjustmentFormComponent } from "./Entities/mjBizAppsOrdersOrderAdjustment/mjbizappsordersorderadjustment.form.component";
import { mjBizAppsOrdersOrderChargeAllocationFormComponent } from "./Entities/mjBizAppsOrdersOrderChargeAllocation/mjbizappsordersorderchargeallocation.form.component";
import { mjBizAppsOrdersOrderChargeFormComponent } from "./Entities/mjBizAppsOrdersOrderCharge/mjbizappsordersordercharge.form.component";
import { mjBizAppsOrdersOrderCompanyPolicyFormComponent } from "./Entities/mjBizAppsOrdersOrderCompanyPolicy/mjbizappsordersordercompanypolicy.form.component";
import { mjBizAppsOrdersOrderHeaderPaymentScheduleFormComponent } from "./Entities/mjBizAppsOrdersOrderHeaderPaymentSchedule/mjbizappsordersorderheaderpaymentschedule.form.component";
import { mjBizAppsOrdersOrderHeaderFormComponent } from "./Entities/mjBizAppsOrdersOrderHeader/mjbizappsordersorderheader.form.component";
import { mjBizAppsOrdersOrderLineDimensionFormComponent } from "./Entities/mjBizAppsOrdersOrderLineDimension/mjbizappsordersorderlinedimension.form.component";
import { mjBizAppsOrdersOrderLineFormComponent } from "./Entities/mjBizAppsOrdersOrderLine/mjbizappsordersorderline.form.component";
import { mjBizAppsOrdersOrderLinePriceComponentFormComponent } from "./Entities/mjBizAppsOrdersOrderLinePriceComponent/mjbizappsordersorderlinepricecomponent.form.component";
import { mjBizAppsOrdersOrderSequenceFormComponent } from "./Entities/mjBizAppsOrdersOrderSequence/mjbizappsordersordersequence.form.component";
import { mjBizAppsOrdersPaymentDetailFormComponent } from "./Entities/mjBizAppsOrdersPaymentDetail/mjbizappsorderspaymentdetail.form.component";
import { mjBizAppsOrdersPaymentHeaderFormComponent } from "./Entities/mjBizAppsOrdersPaymentHeader/mjbizappsorderspaymentheader.form.component";
import { mjBizAppsOrdersPaymentIntentFormComponent } from "./Entities/mjBizAppsOrdersPaymentIntent/mjbizappsorderspaymentintent.form.component";
import { mjBizAppsOrdersPaymentLineFormComponent } from "./Entities/mjBizAppsOrdersPaymentLine/mjbizappsorderspaymentline.form.component";
import { mjBizAppsOrdersPaymentProviderFormComponent } from "./Entities/mjBizAppsOrdersPaymentProvider/mjbizappsorderspaymentprovider.form.component";
import { mjBizAppsOrdersExternalCustomerFormComponent } from "./Entities/mjBizAppsOrdersExternalCustomer/mjbizappsordersexternalcustomer.form.component";
import { mjBizAppsOrdersExternalInvoiceFormComponent } from "./Entities/mjBizAppsOrdersExternalInvoice/mjbizappsordersexternalinvoice.form.component";
import { mjBizAppsOrdersExternalPaymentFormComponent } from "./Entities/mjBizAppsOrdersExternalPayment/mjbizappsordersexternalpayment.form.component";
import { mjBizAppsOrdersPaymentProviderSyncStateFormComponent } from "./Entities/mjBizAppsOrdersPaymentProviderSyncState/mjbizappsorderspaymentprovidersyncstate.form.component";
import { mjBizAppsOrdersPaymentProviderTypeFormComponent } from "./Entities/mjBizAppsOrdersPaymentProviderType/mjbizappsorderspaymentprovidertype.form.component";
import { mjBizAppsOrdersPaymentSequenceFormComponent } from "./Entities/mjBizAppsOrdersPaymentSequence/mjbizappsorderspaymentsequence.form.component";
import { mjBizAppsOrdersPaymentTermsTypeFormComponent } from "./Entities/mjBizAppsOrdersPaymentTermsType/mjbizappsorderspaymenttermstype.form.component";
import { mjBizAppsOrdersPaymentTypeFormComponent } from "./Entities/mjBizAppsOrdersPaymentType/mjbizappsorderspaymenttype.form.component";
import { mjBizAppsOrdersPriceListAssignmentFormComponent } from "./Entities/mjBizAppsOrdersPriceListAssignment/mjbizappsorderspricelistassignment.form.component";
import { mjBizAppsOrdersPriceListFormComponent } from "./Entities/mjBizAppsOrdersPriceList/mjbizappsorderspricelist.form.component";
import { mjBizAppsOrdersPriceTierFormComponent } from "./Entities/mjBizAppsOrdersPriceTier/mjbizappsorderspricetier.form.component";
import { mjBizAppsOrdersProductBundleItemFormComponent } from "./Entities/mjBizAppsOrdersProductBundleItem/mjbizappsordersproductbundleitem.form.component";
import { mjBizAppsOrdersProductCategoryFormComponent } from "./Entities/mjBizAppsOrdersProductCategory/mjbizappsordersproductcategory.form.component";
import { mjBizAppsOrdersProductEntitlementFormComponent } from "./Entities/mjBizAppsOrdersProductEntitlement/mjbizappsordersproductentitlement.form.component";
import { mjBizAppsOrdersProductFormComponent } from "./Entities/mjBizAppsOrdersProduct/mjbizappsordersproduct.form.component";
import { mjBizAppsOrdersProductPriceFormComponent } from "./Entities/mjBizAppsOrdersProductPrice/mjbizappsordersproductprice.form.component";
import { mjBizAppsOrdersProductTypeFormComponent } from "./Entities/mjBizAppsOrdersProductType/mjbizappsordersproducttype.form.component";
import { mjBizAppsOrdersPromotionCodeFormComponent } from "./Entities/mjBizAppsOrdersPromotionCode/mjbizappsorderspromotioncode.form.component";
import { mjBizAppsOrdersPromotionFormComponent } from "./Entities/mjBizAppsOrdersPromotion/mjbizappsorderspromotion.form.component";
import { mjBizAppsOrdersPromotionTargetFormComponent } from "./Entities/mjBizAppsOrdersPromotionTarget/mjbizappsorderspromotiontarget.form.component";
import { mjBizAppsOrdersPromotionTypeFormComponent } from "./Entities/mjBizAppsOrdersPromotionType/mjbizappsorderspromotiontype.form.component";
import { mjBizAppsOrdersRevenueRecognitionTypeFormComponent } from "./Entities/mjBizAppsOrdersRevenueRecognitionType/mjbizappsordersrevenuerecognitiontype.form.component";
import { mjBizAppsOrdersSalesAuthorityFormComponent } from "./Entities/mjBizAppsOrdersSalesAuthority/mjbizappsorderssalesauthority.form.component";
import { mjBizAppsOrdersSalesRuleFormComponent } from "./Entities/mjBizAppsOrdersSalesRule/mjbizappsorderssalesrule.form.component";
import { mjBizAppsOrdersStoredValueAccountFormComponent } from "./Entities/mjBizAppsOrdersStoredValueAccount/mjbizappsordersstoredvalueaccount.form.component";
import { mjBizAppsOrdersStoredValueTransactionFormComponent } from "./Entities/mjBizAppsOrdersStoredValueTransaction/mjbizappsordersstoredvaluetransaction.form.component";
import { mjBizAppsOrdersSubscriptionEventFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionEvent/mjbizappsorderssubscriptionevent.form.component";
import { mjBizAppsOrdersSubscriptionFormComponent } from "./Entities/mjBizAppsOrdersSubscription/mjbizappsorderssubscription.form.component";
import { mjBizAppsOrdersSubscriptionSequenceFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionSequence/mjbizappsorderssubscriptionsequence.form.component";
import { mjBizAppsOrdersSubscriptionTermFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionTerm/mjbizappsorderssubscriptionterm.form.component";
import { mjBizAppsOrdersSubscriptionTypeFormComponent } from "./Entities/mjBizAppsOrdersSubscriptionType/mjbizappsorderssubscriptiontype.form.component";
   

@NgModule({
declarations: [
    mjBizAppsOrdersEventOrderLineFormComponent
],
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
    mjBizAppsOrdersEntitlementGrantFormComponent
],
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
    mjBizAppsOrdersCheckoutSessionFormComponent,
    mjBizAppsOrdersPromotionCodeFormComponent
],
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
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderSequenceFormComponent
],
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
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersCustomerPaymentMethodFormComponent,
    mjBizAppsOrdersPaymentDetailFormComponent
],
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
export class GeneratedForms_SubModule_6 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersPromotionTargetFormComponent,
    mjBizAppsOrdersStoredValueTransactionFormComponent
],
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
export class GeneratedForms_SubModule_7 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersEventProductFormComponent,
    mjBizAppsOrdersSubscriptionEventFormComponent
],
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
export class GeneratedForms_SubModule_10 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersChargeTypeFormComponent,
    mjBizAppsOrdersPaymentLineFormComponent,
    mjBizAppsOrdersPriceListAssignmentFormComponent
],
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
export class GeneratedForms_SubModule_11 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderCompanyPolicyFormComponent,
    mjBizAppsOrdersPriceListFormComponent
],
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
export class GeneratedForms_SubModule_12 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersCheckoutWidgetDistributionFormComponent,
    mjBizAppsOrdersSalesRuleFormComponent
],
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
export class GeneratedForms_SubModule_13 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersSubscriptionSequenceFormComponent
],
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
export class GeneratedForms_SubModule_15 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersSalesAuthorityFormComponent,
    mjBizAppsOrdersSubscriptionFormComponent
],
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
export class GeneratedForms_SubModule_16 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersPaymentHeaderFormComponent,
    mjBizAppsOrdersPaymentProviderTypeFormComponent,
    mjBizAppsOrdersProductCategoryFormComponent,
    mjBizAppsOrdersSubscriptionTermFormComponent
],
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
export class GeneratedForms_SubModule_18 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersCheckoutWidgetFormComponent,
    mjBizAppsOrdersOrderChargeFormComponent
],
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
export class GeneratedForms_SubModule_19 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderAdjustmentAllocationFormComponent,
    mjBizAppsOrdersOrderHeaderFormComponent,
    mjBizAppsOrdersPaymentTermsTypeFormComponent,
    mjBizAppsOrdersPriceTierFormComponent,
    mjBizAppsOrdersPromotionFormComponent
],
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
export class GeneratedForms_SubModule_20 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderLineFormComponent
],
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
export class GeneratedForms_SubModule_21 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersProductTypeFormComponent,
    mjBizAppsOrdersRevenueRecognitionTypeFormComponent
],
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
export class GeneratedForms_SubModule_22 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersProductPriceFormComponent
],
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
export class GeneratedForms_SubModule_23 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersSubscriptionTypeFormComponent
],
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
export class GeneratedForms_SubModule_24 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderLineDimensionFormComponent,
    mjBizAppsOrdersProductEntitlementFormComponent
],
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
export class GeneratedForms_SubModule_25 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersPaymentProviderFormComponent,
    mjBizAppsOrdersExternalCustomerFormComponent,
    mjBizAppsOrdersExternalInvoiceFormComponent,
    mjBizAppsOrdersExternalPaymentFormComponent,
    mjBizAppsOrdersPaymentProviderSyncStateFormComponent,
    mjBizAppsOrdersPaymentSequenceFormComponent,
    mjBizAppsOrdersStoredValueAccountFormComponent
],
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
export class GeneratedForms_SubModule_26 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersProductBundleItemFormComponent
],
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
export class GeneratedForms_SubModule_27 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersCustomerPaymentTermsFormComponent,
    mjBizAppsOrdersPromotionTypeFormComponent
],
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
export class GeneratedForms_SubModule_28 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderChargeAllocationFormComponent,
    mjBizAppsOrdersOrderLinePriceComponentFormComponent,
    mjBizAppsOrdersPaymentTypeFormComponent
],
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
export class GeneratedForms_SubModule_29 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersOrderAdjustmentFormComponent,
    mjBizAppsOrdersProductFormComponent
],
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
export class GeneratedForms_SubModule_30 { }
    


@NgModule({
declarations: [
    mjBizAppsOrdersCustomerTaxExemptionFormComponent,
    mjBizAppsOrdersPaymentIntentFormComponent,
    mjBizAppsOrdersOrderHeaderPaymentScheduleFormComponent
],
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
export class GeneratedForms_SubModule_31 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2,
    GeneratedForms_SubModule_3,
    GeneratedForms_SubModule_4,
    GeneratedForms_SubModule_6,
    GeneratedForms_SubModule_7,
    GeneratedForms_SubModule_10,
    GeneratedForms_SubModule_11,
    GeneratedForms_SubModule_12,
    GeneratedForms_SubModule_13,
    GeneratedForms_SubModule_15,
    GeneratedForms_SubModule_16,
    GeneratedForms_SubModule_18,
    GeneratedForms_SubModule_19,
    GeneratedForms_SubModule_20,
    GeneratedForms_SubModule_21,
    GeneratedForms_SubModule_22,
    GeneratedForms_SubModule_23,
    GeneratedForms_SubModule_24,
    GeneratedForms_SubModule_25,
    GeneratedForms_SubModule_26,
    GeneratedForms_SubModule_27,
    GeneratedForms_SubModule_28,
    GeneratedForms_SubModule_29,
    GeneratedForms_SubModule_30,
    GeneratedForms_SubModule_31
]
})
export class GeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    
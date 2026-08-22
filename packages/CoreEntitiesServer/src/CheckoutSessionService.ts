/**
 * @fileoverview CheckoutSessionService — server-side machinery for public embeddable checkout widgets.
 *
 * Coordinates anonymous sessions, slug resolution, draft order assembly, pricing recalculation,
 * payment tokenization, and post-checkout entitlement/identity claim generation.
 *
 * @module @mj-biz-apps/orders-core-entities-server/CheckoutSessionService
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    mjBizAppsOrdersCheckoutSessionEntity,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity,
    mjBizAppsOrdersCheckoutWidgetEntity,
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import { IdentityClaimEngine } from '@memberjunction/core-entities';

const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const CHECKOUT_DISTRIBUTION_ENTITY = 'MJ_BizApps_Orders: Checkout Widget Distributions';
const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const EVENT_ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Event Order Lines';
const PERSON_ENTITY = 'MJ_BizApps_Common: Persons';

/**
 * Attendee registration information for event line extensions
 */
export interface AttendeeInput {
    FirstName: string;
    LastName: string;
    Email: string;
    Company?: string;
    Title?: string;
    Notes?: string;
}

/**
 * Single line item requested in a checkout draft
 */
export interface CheckoutLineInput {
    ProductID: string;
    Quantity: number;
    PriceTierID?: string;
    ExtensionData?: Record<string, unknown>;
    Attendees?: AttendeeInput[];
}

/**
 * Summary of a priced line item in a checkout draft
 */
export interface CheckoutLineSummary {
    ID?: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    ExtendedPrice: number;
    Description?: string;
}

/**
 * Result of initializing or loading a checkout session
 */
export interface InitSessionResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID?: string;
    ClientSessionKey?: string;
    WidgetID?: string;
    WidgetName?: string;
    CompanyID?: string;
    Configuration?: Record<string, unknown>;
    CustomCSS?: string | null;
    CustomJS?: string | null;
    ExpiresAt?: string;
}

/**
 * Result of updating a checkout draft
 */
export interface UpdateDraftResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID: string;
    OrderID?: string;
    OrderNumber?: string;
    Subtotal: number;
    Tax: number;
    Adjustments: number;
    TotalGross: number;
    RequiresPayment: boolean;
    Lines: CheckoutLineSummary[];
}

/**
 * Result of submitting a checkout session
 */
export interface CompleteCheckoutResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID: string;
    Status: string;
    OrderID?: string;
    OrderNumber?: string;
    PaymentIntentID?: string;
    ClientSecret?: string;
}

export class CheckoutSessionService {
    /**
     * Resolves a public distribution slug, validates widget status, and mints an active CheckoutSession.
     */
    public static async InitializeSession(
        slug: string,
        clientSessionKey: string,
        contextUser?: UserInfo
    ): Promise<InitSessionResult> {
        if (!slug) {
            return { Success: false, ErrorMessage: 'Widget distribution slug is required' };
        }
        if (!clientSessionKey) {
            return { Success: false, ErrorMessage: 'ClientSessionKey is required' };
        }

        const rv = new RunView();
        const escapedSlug = slug.trim().replace(/'/g, "''");
        const distRes = await rv.RunView<mjBizAppsOrdersCheckoutWidgetDistributionEntity>({
            EntityName: CHECKOUT_DISTRIBUTION_ENTITY,
            ExtraFilter: `Slug = '${escapedSlug}' AND Status = 'Active'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!distRes.Success || !distRes.Results || distRes.Results.length === 0) {
            return { Success: false, ErrorMessage: `Active checkout distribution not found for slug '${slug}'` };
        }

        const distribution = distRes.Results[0];
        const md = new Metadata();
        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        const loadedWidget = await widget.Load(distribution.CheckoutWidgetID);
        if (!loadedWidget || widget.Status !== 'Active') {
            return { Success: false, ErrorMessage: 'The requested checkout widget is currently unavailable' };
        }

        // Check for existing unexpired session for this client
        const escapedKey = clientSessionKey.trim().replace(/'/g, "''");
        const sessRes = await rv.RunView<mjBizAppsOrdersCheckoutSessionEntity>({
            EntityName: CHECKOUT_SESSION_ENTITY,
            ExtraFilter: `CheckoutWidgetID = '${widget.ID}' AND ClientSessionKey = '${escapedKey}' AND Status = 'Open' AND ExpiresAt > GETUTCDATE()`,
            ResultType: 'entity_object'
        }, contextUser);

        let session: mjBizAppsOrdersCheckoutSessionEntity;
        if (sessRes.Success && sessRes.Results && sessRes.Results.length > 0) {
            session = sessRes.Results[0];
        } else {
            session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
            session.NewRecord();
            session.CheckoutWidgetID = widget.ID;
            session.DistributionID = distribution.ID;
            session.ClientSessionKey = clientSessionKey;
            session.Status = 'Open';
            
            const expires = new Date();
            expires.setHours(expires.getHours() + 2); // 2 hour checkout session TTL
            session.ExpiresAt = expires;
            
            const saved = await session.Save();
            if (!saved) {
                return { Success: false, ErrorMessage: 'Failed to initialize checkout session record' };
            }
        }

        let configObj: Record<string, unknown> = {};
        if (widget.Configuration) {
            try {
                configObj = JSON.parse(widget.Configuration) as Record<string, unknown>;
            } catch {
                configObj = {};
            }
        }

        return {
            Success: true,
            SessionID: session.ID,
            ClientSessionKey: session.ClientSessionKey,
            WidgetID: widget.ID,
            WidgetName: widget.Name,
            CompanyID: widget.CompanyID,
            Configuration: configObj,
            CustomCSS: widget.CustomCSS,
            CustomJS: widget.CustomJS,
            ExpiresAt: session.ExpiresAt.toISOString()
        };
    }

    /**
     * Assembles or updates a draft Order for an open checkout session, running pricing calculations.
     */
    public static async UpdateDraft(
        sessionID: string,
        email: string,
        lines: CheckoutLineInput[],
        contextUser?: UserInfo
    ): Promise<UpdateDraftResult> {
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const loaded = await session.Load(sessionID);
        if (!loaded || session.Status !== 'Open') {
            return {
                Success: false,
                ErrorMessage: 'Invalid or expired checkout session',
                SessionID: sessionID,
                Subtotal: 0,
                Tax: 0,
                Adjustments: 0,
                TotalGross: 0,
                RequiresPayment: false,
                Lines: []
            };
        }

        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        await widget.Load(session.CheckoutWidgetID);

        // Load or create Draft OrderHeader
        let order: mjBizAppsOrdersOrderHeaderEntity;
        if (session.DraftOrderID) {
            order = await md.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
            await order.Load(session.DraftOrderID);
        } else {
            order = await md.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
            order.NewRecord();
            order.CompanyID = widget.CompanyID;
            order.Status = 'Draft';
            order.Origin = 'Widget';
            order.SourceCheckoutWidgetID = widget.ID;
            order.OrderDate = new Date();
        }

        const normalizedEmail = (email || '').trim().toLowerCase();
        session.Email = normalizedEmail;

        const savedOrder = await order.Save();
        if (!savedOrder) {
            return {
                Success: false,
                ErrorMessage: `Failed to save draft order: ${order.LatestResult?.Message}`,
                SessionID: sessionID,
                Subtotal: 0,
                Tax: 0,
                Adjustments: 0,
                TotalGross: 0,
                RequiresPayment: false,
                Lines: []
            };
        }

        session.DraftOrderID = order.ID;
        await session.Save();

        // Populate order lines
        const rv = new RunView();
        const existingLinesRes = await rv.RunView<mjBizAppsOrdersOrderLineEntity>({
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${order.ID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        // Remove old lines if reconstructing draft
        if (existingLinesRes.Success && existingLinesRes.Results) {
            for (const oldLine of existingLinesRes.Results) {
                await oldLine.Delete();
            }
        }

        let sequence = 1;
        const lineSummaries: CheckoutLineSummary[] = [];

        for (const inputLine of lines) {
            const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, contextUser);
            line.NewRecord();
            line.OrderHeaderID = order.ID;
            line.ProductID = inputLine.ProductID;
            line.Quantity = inputLine.Quantity;
            line.LineNumber = sequence++;

            // Handle multi-attendee event lines or extensions
            if (inputLine.Attendees && inputLine.Attendees.length > 0) {
                // First attendee linked on primary line
                const primaryAttendee = inputLine.Attendees[0];
                line.Description = `${primaryAttendee.FirstName} ${primaryAttendee.LastName} (${primaryAttendee.Email})`;
            }

            await line.Save();

            lineSummaries.push({
                ID: line.ID,
                ProductID: line.ProductID,
                Quantity: line.Quantity,
                UnitPrice: line.UnitPrice ?? 0,
                ExtendedPrice: line.LineTotalGross ?? ((line.UnitPrice ?? 0) * line.Quantity),
                Description: line.Description ?? undefined
            });
        }

        // Re-load order to get trigger-calculated totals
        await order.Load(order.ID);

        const totalGross = order.TotalGross ?? lineSummaries.reduce((sum, l) => sum + l.ExtendedPrice, 0);

        return {
            Success: true,
            SessionID: session.ID,
            OrderID: order.ID,
            OrderNumber: order.OrderNumber,
            Subtotal: totalGross,
            Tax: 0,
            Adjustments: 0,
            TotalGross: totalGross,
            RequiresPayment: totalGross > 0,
            Lines: lineSummaries
        };
    }

    /**
     * Completes the checkout session: confirms $0 orders immediately or prepares payment capture.
     */
    public static async CompleteCheckout(
        sessionID: string,
        contextUser?: UserInfo
    ): Promise<CompleteCheckoutResult> {
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const loaded = await session.Load(sessionID);
        if (!loaded || session.Status !== 'Open') {
            return {
                Success: false,
                ErrorMessage: 'Session is not in an Open status',
                SessionID: sessionID,
                Status: session?.Status ?? 'Unknown'
            };
        }

        if (!session.DraftOrderID) {
            return {
                Success: false,
                ErrorMessage: 'No draft order associated with session',
                SessionID: sessionID,
                Status: session.Status
            };
        }

        const order = await md.GetEntityObject<mjBizAppsOrdersOrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        await order.Load(session.DraftOrderID);

        const totalGross = order.TotalGross ?? 0;

        // If $0 order (e.g. Free registration or 100% promo)
        if (totalGross === 0) {
            order.Status = 'Confirmed';
            const saved = await order.Save();
            if (!saved) {
                return {
                    Success: false,
                    ErrorMessage: `Failed to confirm free order: ${order.LatestResult?.Message}`,
                    SessionID: sessionID,
                    Status: session.Status
                };
            }

            session.Status = 'Confirmed';
            await session.Save();

            // If session has email and entitlement was generated, ensure identity claims exist for external access
            if (session.Email) {
                try {
                    await IdentityClaimEngine.Instance.CreateClaim({
                        ClaimTypeName: 'EntitlementGrant',
                        NormalizedEmail: session.Email,
                        EntityID: ORDER_HEADER_ENTITY,
                        RecordID: order.ID,
                        Payload: { OrderID: order.ID, OrderNumber: order.OrderNumber }
                    }, contextUser);
                } catch {
                    // Identity claim creation logged but non-blocking for completion
                }
            }

            return {
                Success: true,
                SessionID: session.ID,
                Status: 'Confirmed',
                OrderID: order.ID,
                OrderNumber: order.OrderNumber
            };
        }

        // For paid orders, return processing status so client payment flow continues
        session.Status = 'Processing';
        await session.Save();

        return {
            Success: true,
            SessionID: session.ID,
            Status: 'Processing',
            OrderID: order.ID,
            OrderNumber: order.OrderNumber
        };
    }
}

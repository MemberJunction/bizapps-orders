/**
 * @fileoverview CheckoutSessionService
 *
 * Provides generic server-side orchestration for anonymous checkout sessions, widget token
 * initialization, draft order graph composition with polymorphic product extensions,
 * and payment completion handling.
 *
 * @module @mj-biz-apps/orders-core-entities-server/CheckoutSessionService
 */

import { BaseEntity, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    mjBizAppsOrdersCheckoutSessionEntity,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity,
    mjBizAppsOrdersCheckoutWidgetEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductTypeEntity,
    type CheckoutWidgetConfiguration,
    type ProductTypeConfiguration
} from '@mj-biz-apps/orders-entities';
import { IdentityClaimEngineServer } from '@memberjunction/core-entities-server';

const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const CHECKOUT_DISTRIBUTION_ENTITY = 'MJ_BizApps_Orders: Checkout Widget Distributions';
const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';

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

export interface CheckoutAttendeeInput {
    FirstName: string;
    LastName: string;
    Email: string;
    Company?: string;
    PersonID?: string;
    DietaryPreferences?: string;
    Comments?: string;
}

export type AttendeeInput = CheckoutAttendeeInput;

export interface CheckoutLineExtensionData {
    /** Target extension entity name (e.g. 'MJ_BizApps_Orders: Event Order Lines') */
    EntityName?: string;
    /** Key-value dictionary of extension fields */
    Fields?: Record<string, unknown>;
    /** For multi-unit items (e.g. 3 tickets), array of per-unit field dictionaries */
    Units?: Array<Record<string, unknown>>;
}

export interface CheckoutLineInput {
    ProductID: string;
    Quantity: number;
    /** Generic polymorphic extension payload */
    ExtensionData?: CheckoutLineExtensionData;
    /** Generic field dictionary directly on line input */
    ExtensionFields?: Record<string, unknown>;
    /** Per-unit field dictionaries */
    Units?: Array<Record<string, unknown>>;
    /** Legacy attendee input compatibility */
    Attendees?: CheckoutAttendeeInput[];
}

export interface CheckoutLineSummary {
    ID: string;
    ProductID: string;
    Quantity: number;
    UnitPrice: number;
    ExtendedPrice: number;
    Description?: string;
}

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

        let configObj: CheckoutWidgetConfiguration = {};
        if (widget.Configuration) {
            try {
                configObj = JSON.parse(widget.Configuration) as CheckoutWidgetConfiguration;
            } catch {
                configObj = {};
            }
        }

        // Ensure customUI section is populated, cascading from entity fields if needed
        if (!configObj.customUI) {
            configObj.customUI = {};
        }
        if (widget.CustomCSS && !configObj.customUI.css) {
            configObj.customUI.css = widget.CustomCSS;
        }
        if (widget.CustomJS && !configObj.customUI.js) {
            configObj.customUI.js = widget.CustomJS;
        }

        return {
            Success: true,
            SessionID: session.ID,
            ClientSessionKey: session.ClientSessionKey,
            WidgetID: widget.ID,
            WidgetName: widget.Name,
            CompanyID: widget.CompanyID,
            Configuration: configObj,
            CustomCSS: configObj.customUI.css || widget.CustomCSS,
            CustomJS: configObj.customUI.js || widget.CustomJS,
            ExpiresAt: session.ExpiresAt.toISOString()
        };
    }

    /**
     * Resolves or creates a Person entity record based on provided fields.
     */
    private static async resolveOrEnsurePerson(
        fields: Record<string, unknown>,
        contextUser?: UserInfo
    ): Promise<string | null> {
        const email = (fields['Email'] || fields['email'] || fields['PrimaryEmail']) as string | undefined;
        if (!email || !email.trim()) {
            return null;
        }

        const normalized = email.trim().toLowerCase();
        const rv = new RunView();
        const escaped = normalized.replace(/'/g, "''");
        const personRes = await rv.RunView<{ ID: string }>({
            EntityName: PERSON_ENTITY,
            ExtraFilter: `Email = '${escaped}' OR PrimaryEmail = '${escaped}'`,
            ResultType: 'simple'
        }, contextUser);

        if (personRes.Success && personRes.Results && personRes.Results.length > 0) {
            return personRes.Results[0].ID;
        }

        const firstName = (fields['FirstName'] || fields['firstName'] || '') as string;
        const lastName = (fields['LastName'] || fields['lastName'] || '') as string;
        if (firstName || lastName) {
            try {
                const md = new Metadata();
                const person = await md.GetEntityObject<BaseEntity>(PERSON_ENTITY, contextUser);
                person.NewRecord();
                person.Set('FirstName', firstName);
                person.Set('LastName', lastName);
                person.Set('Email', normalized);
                person.Set('PrimaryEmail', normalized);
                if (fields['Company'] || fields['company']) {
                    person.Set('CompanyName', fields['Company'] || fields['company']);
                }
                const saved = await person.Save();
                if (saved) {
                    return person.Get('ID') as string;
                }
            } catch {
                // Person creation is non-blocking
            }
        }
        return null;
    }

    /**
     * Dynamically populates and coerces extension companion properties from a field map.
     */
    private static async hydrateLineExtension(
        line: OrderLineEntity,
        extensionEntityName: string | null | undefined,
        fieldValues: Record<string, unknown>,
        contextUser?: UserInfo
    ): Promise<void> {
        if (!extensionEntityName || !fieldValues || Object.keys(fieldValues).length === 0) {
            return;
        }

        const ext = await line.Extension.EnsureEntity(extensionEntityName);
        if (!ext) {
            return;
        }

        // Build descriptive summary for the line card if names/email are present
        const firstName = fieldValues['FirstName'] || fieldValues['firstName'];
        const lastName = fieldValues['LastName'] || fieldValues['lastName'];
        const email = fieldValues['Email'] || fieldValues['email'];
        const nameOrEmail = [
            firstName,
            lastName,
            email ? `(${email})` : ''
        ].filter(Boolean).join(' ');

        if (nameOrEmail) {
            line.Description = nameOrEmail;
        }

        // Auto-resolve PersonID if person fields exist on the extension entity
        const personIdField = ext.EntityInfo.Fields.find(f => f.Name === 'PersonID' || f.Name === 'AttendeePersonID');
        if (personIdField && !fieldValues['PersonID'] && !fieldValues['personId']) {
            if (email) {
                const resolvedPersonID = await this.resolveOrEnsurePerson(fieldValues, contextUser);
                if (resolvedPersonID) {
                    ext.Set(personIdField.Name, resolvedPersonID);
                }
            }
        }

        // Dynamic field assignment with type coercion
        const fieldsByName = new Map(ext.EntityInfo.Fields.map(f => [f.Name.toLowerCase(), f]));

        for (const [key, rawValue] of Object.entries(fieldValues)) {
            const field = fieldsByName.get(key.toLowerCase());
            if (field && !field.IsPrimaryKey && !field.IsVirtual && field.AllowUpdateAPI) {
                let coerced = rawValue;
                if (field.Type.toLowerCase().includes('int') && typeof rawValue === 'string') {
                    coerced = parseInt(rawValue, 10);
                } else if ((field.Type.toLowerCase().includes('decimal') || field.Type.toLowerCase().includes('money')) && typeof rawValue === 'string') {
                    coerced = parseFloat(rawValue);
                } else if (field.Type.toLowerCase() === 'bit' && typeof rawValue === 'string') {
                    coerced = rawValue === 'true' || rawValue === '1';
                }
                ext.Set(field.Name, coerced);
            }
        }
    }

    /**
     * Extracts unit field maps from an input line across all polymorphic formats.
     */
    private static extractUnitPayloads(inputLine: CheckoutLineInput): Array<Record<string, unknown>> {
        if (inputLine.ExtensionData?.Units && inputLine.ExtensionData.Units.length > 0) {
            return inputLine.ExtensionData.Units;
        }
        if (inputLine.Units && inputLine.Units.length > 0) {
            return inputLine.Units;
        }
        if (inputLine.Attendees && inputLine.Attendees.length > 0) {
            return inputLine.Attendees.map(a => ({
                FirstName: a.FirstName,
                LastName: a.LastName,
                Email: a.Email,
                Company: a.Company,
                PersonID: a.PersonID,
                DietaryPreferences: a.DietaryPreferences,
                Comments: a.Comments
            }));
        }
        if (inputLine.ExtensionData?.Fields && Object.keys(inputLine.ExtensionData.Fields).length > 0) {
            return [inputLine.ExtensionData.Fields];
        }
        if (inputLine.ExtensionFields && Object.keys(inputLine.ExtensionFields).length > 0) {
            return [inputLine.ExtensionFields];
        }
        return [];
    }

    /**
     * Assembles or updates a draft Order using the in-memory order graph (`order.Lines` and
     * companion extensions) and persists the complete order graph in a single atomic transaction.
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

        // Load existing draft order with lines or create a new OrderHeaderEntity
        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        if (session.DraftOrderID) {
            await order.LoadWithLines(session.DraftOrderID);
            // Clear existing in-memory lines to rebuild from current input
            order.Lines.Clear();
        } else {
            order.NewRecord();
            order.CompanyID = widget.CompanyID;
            order.Status = 'Draft';
            order.Origin = 'Widget';
            order.SourceCheckoutWidgetID = widget.ID;
            order.OrderDate = new Date();
        }

        const normalizedEmail = (email || '').trim().toLowerCase();
        session.Email = normalizedEmail;

        if (session.PersonID) {
            order.BillToPersonID = session.PersonID;
            order.ShipToPersonID = session.PersonID;
        }

        let sequence = 1;
        for (const inputLine of lines) {
            // Introspect Product and ProductType to discover extension configuration
            let targetExtensionEntity = inputLine.ExtensionData?.EntityName ?? null;
            let maxQuantityPerLine: number | null = null;

            if (inputLine.ProductID) {
                try {
                    const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
                    const prodLoaded = await product.Load(inputLine.ProductID);
                    if (prodLoaded) {
                        maxQuantityPerLine = product.MaxQuantityPerLine ?? null;
                        if (product.ProductTypeID) {
                            const pType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
                            const pTypeLoaded = await pType.Load(product.ProductTypeID);
                            if (pTypeLoaded) {
                                if (!targetExtensionEntity) {
                                    targetExtensionEntity = pType.OrderLineExtensionEntity ?? null;
                                }
                                if (pType.Configuration) {
                                    try {
                                        const pTypeConfig = JSON.parse(pType.Configuration) as ProductTypeConfiguration;
                                        if (pTypeConfig.unitMode === 'perUnit') {
                                            maxQuantityPerLine = 1;
                                        }
                                        if (pTypeConfig.maxQuantity && !maxQuantityPerLine) {
                                            maxQuantityPerLine = pTypeConfig.maxQuantity;
                                        }
                                    } catch {
                                        // Ignore malformed JSON in Configuration
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    // Fallback to direct input line extension if product load is mocked or unavailable
                }
            }

            const unitPayloads = this.extractUnitPayloads(inputLine);

            // If product enforces 1-unit per line (e.g. conference tickets) and multiple unit payloads exist:
            if ((maxQuantityPerLine === 1 || unitPayloads.length > 1) && unitPayloads.length > 0) {
                for (const unitData of unitPayloads) {
                    const line = (await order.Lines.Create()) as OrderLineEntity;
                    line.ProductID = inputLine.ProductID;
                    line.Quantity = 1;
                    line.LineNumber = sequence++;

                    await this.hydrateLineExtension(line, targetExtensionEntity, unitData, contextUser);
                }
            } else {
                const line = (await order.Lines.Create()) as OrderLineEntity;
                line.ProductID = inputLine.ProductID;
                line.Quantity = inputLine.Quantity;
                line.LineNumber = sequence++;

                if (unitPayloads.length > 0) {
                    await this.hydrateLineExtension(line, targetExtensionEntity, unitPayloads[0], contextUser);
                }
            }
        }

        // Single atomic graph save for order header + lines + companions
        const savedOrder = await order.Save();
        if (!savedOrder) {
            return {
                Success: false,
                ErrorMessage: `Failed to save draft order: ${order.LatestResult?.Message ?? 'Validation error'}`,
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

        // Build line summaries from the saved order graph
        const lineSummaries: CheckoutLineSummary[] = (order.Lines.Items as OrderLineEntity[]).map(l => ({
            ID: l.ID,
            ProductID: l.ProductID,
            Quantity: l.Quantity,
            UnitPrice: l.UnitPrice ?? 0,
            ExtendedPrice: l.LineTotalGross ?? ((l.UnitPrice ?? 0) * l.Quantity),
            Description: l.Description ?? undefined
        }));

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

        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
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

            // If session has email, issue identity claim for external access
            if (session.Email) {
                try {
                    await IdentityClaimEngineServer.Instance.CreateClaim({
                        ClaimTypeName: 'EntitlementGrant',
                        NormalizedEmail: session.Email,
                        EntityID: ORDER_HEADER_ENTITY,
                        RecordID: order.ID,
                        Payload: { OrderID: order.ID, OrderNumber: order.OrderNumber },
                        SendEmail: true
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

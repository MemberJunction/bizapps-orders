/**
 * @fileoverview CheckoutSessionService
 *
 * Provides generic server-side orchestration for anonymous checkout sessions, widget token
 * initialization, draft order graph composition with polymorphic product extensions,
 * and payment completion handling.
 *
 * @module @mj-biz-apps/orders-core-entities-server/CheckoutSessionService
 */

import { BaseEntity, EntityFieldInfo, IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    OrderPricingService,
    mjBizAppsOrdersOrderLineEntity,
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
                const parsed = JSON.parse(widget.Configuration);
                if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    throw new Error('Widget Configuration must be a JSON object');
                }
                configObj = parsed as CheckoutWidgetConfiguration;
            } catch (err) {
                return {
                    Success: false,
                    ErrorMessage: `Invalid widget configuration: ${err instanceof Error ? err.message : String(err)}`
                };
            }
        }

        // Ensure customUI section is populated, cascading from entity fields if needed
        if (!configObj.customUI) {
            configObj.customUI = {};
        }
        if (widget.CustomCSS && !configObj.customUI.css) {
            configObj.customUI.css = widget.CustomCSS;
        }
        // Auto-discover extension fields from product type metadata if not explicitly provided
        await this.discoverExtensionFields(configObj, md, contextUser);

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
     * Discovers extension field definitions from metadata for the target product's extension entity.
     */
    private static async discoverExtensionFields(
        configObj: CheckoutWidgetConfiguration,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<void> {
        if (Array.isArray(configObj.extensionFields) && configObj.extensionFields.length > 0) {
            return;
        }

        let productId = typeof configObj.productId === 'string' ? configObj.productId : undefined;
        const productSku = typeof configObj.productSku === 'string' ? configObj.productSku : undefined;

        if (!productId && productSku) {
            const rv = new RunView();
            const escapedSku = productSku.trim().replace(/'/g, "''");
            const prodRes = await rv.RunView<{ ID: string }>({
                EntityName: PRODUCT_ENTITY,
                ExtraFilter: `SKU = '${escapedSku}'`,
                ResultType: 'simple'
            }, contextUser);
            if (prodRes?.Success && prodRes.Results && prodRes.Results.length > 0) {
                productId = prodRes.Results[0].ID;
            }
        }

        if (!productId) return;

        const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
        const prodLoaded = await product.Load(productId);
        if (!prodLoaded || !product.ProductTypeID) return;

        const productType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
        const typeLoaded = await productType.Load(product.ProductTypeID);
        if (!typeLoaded || !productType.OrderLineExtensionEntity) return;

        const extEntityName = productType.OrderLineExtensionEntity;
        configObj.extensionEntityName = extEntityName;

        const extEntityInfo = md.Entities.find(e => e.Name === extEntityName);
        if (!extEntityInfo) return;

        const discoveredFields: Array<{
            name: string;
            label: string;
            type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select';
            required: boolean;
            placeholder?: string;
        }> = [];

        // Check if extension links to a Person
        const hasPerson = extEntityInfo.Fields.some(f => f.Name.toLowerCase() === 'personid');
        if (hasPerson) {
            discoveredFields.push(
                { name: 'firstName', label: 'First Name', type: 'text', required: true, placeholder: 'Jane' },
                { name: 'lastName', label: 'Last Name', type: 'text', required: true, placeholder: 'Doe' },
                { name: 'email', label: 'Email Address', type: 'text', required: true, placeholder: 'jane.doe@example.com' },
                { name: 'company', label: 'Company / Organization', type: 'text', required: false, placeholder: 'Acme Corp' },
                { name: 'title', label: 'Job Title', type: 'text', required: false, placeholder: 'Director' }
            );
        }

        const excluded = new Set(['id', 'personid', 'checkinat']);
        const parentFields = new Set<string>();
        if (extEntityInfo.ParentEntityFieldNames) {
            for (const n of extEntityInfo.ParentEntityFieldNames) {
                parentFields.add(n.toLowerCase());
            }
        }

        for (const f of extEntityInfo.Fields) {
            const lower = f.Name.toLowerCase();
            if (excluded.has(lower) || parentFields.has(lower) || lower.startsWith('__mj_') || f.IsPrimaryKey || f.IsVirtual || !f.AllowUpdateAPI) {
                continue;
            }

            let fieldType: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' = 'text';
            const sqlType = (f.Type || '').toLowerCase();
            const valList = (f.ValueListType || '').toLowerCase();

            if (valList === 'list' || valList === 'listoruserentry') {
                fieldType = 'select';
            } else if (sqlType === 'bit') {
                fieldType = 'boolean';
            } else if (['date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime'].includes(sqlType)) {
                fieldType = 'date';
            } else if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(sqlType)) {
                fieldType = 'number';
            } else if (['ntext', 'text', 'nvarchar(max)', 'varchar(max)'].includes(sqlType) || (f.Length && f.Length > 255)) {
                fieldType = 'textarea';
            }

            const camelName = f.Name.charAt(0).toLowerCase() + f.Name.slice(1);
            const label = f.DisplayName?.trim() || f.Name.replace(/([a-z])([A-Z])/g, '$1 $2');

            discoveredFields.push({
                name: camelName,
                label,
                type: fieldType,
                required: !f.AllowsNull,
                placeholder: f.Description || label
            });
        }

        configObj.extensionFields = discoveredFields;
    }

    /**
     * Resolves or creates a Person entity record based on provided fields.
     * Resolves or ensures a Person entity record based on provided fields.
     */
    private static async resolveOrEnsurePerson(
        fields: Record<string, unknown>,
        contextUser?: UserInfo
    ): Promise<string | null> {
        const email = (fields['Email'] || fields['email'] || fields['AttendeeEmail'] || fields['attendeeEmail']) as string | undefined;
        if (!email || !email.trim()) {
            return null;
        }

        const normalized = email.trim().toLowerCase();
        const rv = new RunView();
        const escaped = normalized.replace(/'/g, "''");
        try {
            const personRes = await rv.RunView<{ ID: string }>({
                EntityName: PERSON_ENTITY,
                ExtraFilter: `Email = '${escaped}'`,
                ResultType: 'simple'
            }, contextUser);

            if (personRes?.Success && personRes.Results && personRes.Results.length > 0) {
                return personRes.Results[0].ID;
            }
        } catch (err) {
            console.warn('[CheckoutSessionService] RunView Person lookup error:', err);
        }

        let firstName = (fields['FirstName'] || fields['firstName'] || '') as string;
        let lastName = (fields['LastName'] || fields['lastName'] || '') as string;

        if (!firstName && !lastName && (fields['AttendeeName'] || fields['Name'] || fields['name'])) {
            const fullName = String(fields['AttendeeName'] || fields['Name'] || fields['name']).trim();
            const parts = fullName.split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
        }

        if (firstName || lastName) {
            try {
                const md = new Metadata();
                const person = await md.GetEntityObject<BaseEntity>(PERSON_ENTITY, contextUser);
                if (person) {
                    person.NewRecord();
                    person.Set('FirstName', firstName);
                    person.Set('LastName', lastName || firstName);
                    person.Set('Email', normalized);
                    if (fields['Title'] || fields['title']) {
                        person.Set('Title', String(fields['Title'] || fields['title']));
                    }
                    if (fields['Phone'] || fields['phone']) {
                        person.Set('Phone', String(fields['Phone'] || fields['phone']));
                    }
                    const saved = await person.Save();
                    if (saved) {
                        return person.Get('ID') as string;
                    } else {
                        console.error('[CheckoutSessionService] Person save error:', person.LatestResult?.CompleteMessage);
                    }
                }
            } catch (err) {
                console.error('[CheckoutSessionService] Person creation exception:', err);
            }
        }
        return null;
    }

    /**
     * Creates an order line entity instance attached to the order's Lines collection.
     */
    private static async createOrderLine(
        order: OrderHeaderEntity,
        targetExtensionEntity: string | null,
        _md: Metadata,
        _contextUser?: UserInfo
    ): Promise<OrderLineEntity> {
        const line = (await order.Lines.Create()) as OrderLineEntity;
        if (targetExtensionEntity) {
            await line.Extension.EnsureEntity(targetExtensionEntity);
        }
        return line;
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
        if (!fieldValues || Object.keys(fieldValues).length === 0) {
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
            line.Description = String(nameOrEmail);
        }

        // Auto-resolve PersonID if person fields exist on the entity or extension
        const resolvedPersonID = await this.resolveOrEnsurePerson(fieldValues, contextUser);

        if (extensionEntityName && line.Extension) {
            const ext = await line.Extension.EnsureEntity(extensionEntityName);
            if (ext) {
                const extFieldsByName = new Map<string, EntityFieldInfo>(
                    (ext.EntityInfo?.Fields ?? []).map((f: EntityFieldInfo) => [f.Name.toLowerCase(), f])
                );
                if (resolvedPersonID) {
                    const extPField = extFieldsByName.get('personid') || extFieldsByName.get('attendeepersonid');
                    if (extPField && !extPField.IsPrimaryKey && !extPField.IsVirtual && extPField.AllowUpdateAPI) {
                        ext.Set(extPField.Name, resolvedPersonID);
                    }
                }
                for (const [key, rawValue] of Object.entries(fieldValues)) {
                    const field = extFieldsByName.get(key.toLowerCase());
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
     * Builds and prices draft order lines in memory, persisting the checkout state to the
     * CheckoutSession without creating premature draft rows in the OrderHeader database table.
     */
    public static async UpdateDraft(
        sessionID: string,
        email: string,
        lines: CheckoutLineInput[],
        contextUser?: UserInfo
    ): Promise<UpdateDraftResult> {
        if (!sessionID) {
            return {
                Success: false,
                ErrorMessage: 'Session ID is required.',
                SessionID: '',
                Subtotal: 0,
                Tax: 0,
                Adjustments: 0,
                TotalGross: 0,
                RequiresPayment: false,
                Lines: []
            };
        }

        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const sessionLoaded = await session.Load(sessionID);
        if (!sessionLoaded || session.Status !== 'Open') {
            return {
                Success: false,
                ErrorMessage: 'Checkout session is not valid or has expired.',
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

        // Build in-memory Order graph for accurate pricing calculation without DB pollution
        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        order.NewRecord();
        order.CompanyID = widget.CompanyID;
        order.Status = 'Draft';
        order.Origin = 'Widget';
        order.SourceCheckoutWidgetID = widget.ID;
        order.OrderDate = new Date();

        const normalizedEmail = (email || '').trim().toLowerCase();
        session.Email = normalizedEmail;

        if (session.PersonID) {
            order.BillToPersonID = session.PersonID;
            order.ShipToPersonID = session.PersonID;
        }

        let sequence = 1;
        for (const inputLine of lines) {
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

            if ((maxQuantityPerLine === 1 || unitPayloads.length > 1) && unitPayloads.length > 0) {
                for (const unitData of unitPayloads) {
                    const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                    line.ProductID = inputLine.ProductID;
                    line.Quantity = 1;
                    line.LineNumber = sequence++;

                    await this.hydrateLineExtension(line, targetExtensionEntity, unitData, contextUser);
                }
            } else {
                const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                line.ProductID = inputLine.ProductID;
                line.Quantity = inputLine.Quantity;
                line.LineNumber = sequence++;

                if (unitPayloads.length > 0) {
                    await this.hydrateLineExtension(line, targetExtensionEntity, unitPayloads[0], contextUser);
                }
            }
        }

        // Price the draft order in memory
        try {
            const pricingService = new OrderPricingService({
                Provider: (order.ProviderToUse ?? md) as unknown as IMetadataProvider,
                User: contextUser ?? (order.ContextCurrentUser as UserInfo),
            });

            await pricingService.Price({
                OrderHeaderID: order.ID || null,
                CompanyID: widget.CompanyID,
                BillToPersonID: order.BillToPersonID ?? null,
                BillToOrganizationID: order.BillToOrganizationID ?? null,
                OrderDate: order.OrderDate ?? new Date(),
                ShipToAddressID: order.ShipToAddressID ?? null,
                Lines: [...order.Lines.Items],
                PromotionCodes: [],
                ManualDiscounts: [],
                Charges: [],
            });

            let sumGross = 0;
            for (const line of order.Lines.Items) {
                const extPrice = line.LineTotalGross ?? ((line.UnitPrice ?? 0) * (line.Quantity ?? 1));
                sumGross += extPrice;
            }
            order.TotalGross = Math.round(sumGross * 100) / 100;
        } catch (pricingErr) {
            console.warn('[CheckoutSessionService] Pricing walk error on draft:', pricingErr);
        }

        // Build line summaries from the in-memory priced order graph
        const lineSummaries: CheckoutLineSummary[] = (order.Lines.Items as OrderLineEntity[]).map(l => ({
            ID: l.ID || `line-${l.LineNumber}`,
            ProductID: l.ProductID,
            Quantity: l.Quantity,
            UnitPrice: l.UnitPrice ?? 0,
            ExtendedPrice: l.LineTotalGross ?? ((l.UnitPrice ?? 0) * l.Quantity),
            Description: l.Description ?? undefined
        }));

        const totalGross = order.TotalGross ?? lineSummaries.reduce((sum, l) => sum + l.ExtendedPrice, 0);

        // Store checkout state in session metadata JSON — no orphan OrderHeader rows
        session.MetadataJSON = JSON.stringify({
            Lines: lines,
            Email: normalizedEmail,
            TotalGross: totalGross,
            LineSummaries: lineSummaries
        });
        await session.Save();

        return {
            Success: true,
            SessionID: session.ID,
            OrderID: session.DraftOrderID || '',
            OrderNumber: '',
            Subtotal: totalGross,
            Tax: 0,
            Adjustments: 0,
            TotalGross: totalGross,
            RequiresPayment: totalGross > 0,
            Lines: lineSummaries
        };
    }

    /**
     * Completes the checkout session: atomically builds the Order graph, attaches extensions,
     * prices lines, confirms the order, and executes full BaseEntity lifecycle booking (GL ledger entries).
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

        // Atomically latch status to Processing to prevent concurrent duplicate checkout processing
        session.Status = 'Processing';
        const preSaved = await session.Save();
        if (!preSaved) {
            return {
                Success: false,
                ErrorMessage: 'Failed to acquire checkout session lock or session was concurrently processed',
                SessionID: sessionID,
                Status: session.Status
            };
        }

        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        await widget.Load(session.CheckoutWidgetID);

        let linesInput: CheckoutLineInput[] = [];
        if (session.MetadataJSON) {
            try {
                const parsed = JSON.parse(session.MetadataJSON) as { Lines?: CheckoutLineInput[] };
                if (parsed.Lines && Array.isArray(parsed.Lines)) {
                    linesInput = parsed.Lines;
                }
            } catch {
                // Ignore metadata parse error
            }
        }

        // Atomically create the OrderHeaderEntity
        const order = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
        order.NewRecord();
        order.CompanyID = widget.CompanyID;
        order.BillToPersonID = session.PersonID ?? null;
        order.ShipToPersonID = session.PersonID ?? null;
        order.Origin = 'Widget';
        order.OrderType = 'Sale';
        order.SourceCheckoutWidgetID = widget.ID;
        order.OrderDate = new Date();

        let sequence = 1;
        for (const inputLine of linesInput) {
            let targetExtensionEntity = inputLine.ExtensionData?.EntityName ?? null;
            let maxQuantityPerLine: number | null = null;

            if (inputLine.ProductID) {
                try {
                    const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
                    if (await product.Load(inputLine.ProductID)) {
                        maxQuantityPerLine = product.MaxQuantityPerLine ?? null;
                        if (product.ProductTypeID) {
                            const pType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
                            if (await pType.Load(product.ProductTypeID)) {
                                if (!targetExtensionEntity) {
                                    targetExtensionEntity = pType.OrderLineExtensionEntity ?? null;
                                }
                                if (pType.Configuration) {
                                    try {
                                        const pTypeConfig = JSON.parse(pType.Configuration) as ProductTypeConfiguration;
                                        if (pTypeConfig.unitMode === 'perUnit') maxQuantityPerLine = 1;
                                    } catch {
                                        // Ignore malformed JSON
                                    }
                                }
                            }
                        }
                    }
                } catch {
                    // Fallback
                }
            }

            const unitPayloads = this.extractUnitPayloads(inputLine);

            if ((maxQuantityPerLine === 1 || unitPayloads.length > 1) && unitPayloads.length > 0) {
                for (const unitData of unitPayloads) {
                    const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                    line.ProductID = inputLine.ProductID;
                    line.Quantity = 1;
                    line.LineNumber = sequence++;

                    await this.hydrateLineExtension(line, targetExtensionEntity, unitData, contextUser);
                }
            } else {
                const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                line.ProductID = inputLine.ProductID;
                line.Quantity = inputLine.Quantity;
                line.LineNumber = sequence++;

                if (unitPayloads.length > 0) {
                    await this.hydrateLineExtension(line, targetExtensionEntity, unitPayloads[0], contextUser);
                }
            }
        }

        // Price lines before confirmation
        const pricingService = new OrderPricingService({
            Provider: (order.ProviderToUse ?? md) as unknown as IMetadataProvider,
            User: contextUser ?? (order.ContextCurrentUser as UserInfo),
        });

        await pricingService.Price({
            OrderHeaderID: order.ID || null,
            CompanyID: widget.CompanyID,
            BillToPersonID: order.BillToPersonID ?? null,
            BillToOrganizationID: order.BillToOrganizationID ?? null,
            OrderDate: order.OrderDate ?? new Date(),
            ShipToAddressID: order.ShipToAddressID ?? null,
            Lines: [...order.Lines.Items],
            PromotionCodes: [],
            ManualDiscounts: [],
            Charges: [],
        });

        let sumGross = 0;
        for (const line of order.Lines.Items) {
            const extPrice = line.LineTotalGross ?? ((line.UnitPrice ?? 0) * (line.Quantity ?? 1));
            sumGross += extPrice;
        }
        order.TotalGross = Math.round(sumGross * 100) / 100;

        // Money-path safety: Refuse to confirm paid order without captured/authorized payment
        if (order.TotalGross > 0) {
            const hasPayment = Boolean(session.PaymentIntentID);
            if (!hasPayment) {
                session.Status = 'Open';
                await session.Save();
                return {
                    Success: false,
                    ErrorMessage: 'Cannot confirm paid order (TotalGross > 0) without a valid payment method or capture',
                    SessionID: sessionID,
                    Status: 'Open'
                };
            }
        }

        // Confirm order via BaseEntity lifecycle (executes GL booking, entitlement issuance, status latching)
        try {
            await order.Confirm();
        } catch (confirmErr) {
            session.Status = 'Open';
            await session.Save();
            return {
                Success: false,
                ErrorMessage: `Failed to confirm order: ${confirmErr instanceof Error ? confirmErr.message : String(confirmErr)}`,
                SessionID: sessionID,
                Status: 'Open'
            };
        }

        session.Status = 'Confirmed';
        session.DraftOrderID = order.ID;
        await session.Save();

        // Mint Identity Claim for authenticated external access to order / entitlements
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
                // Non-blocking
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
}

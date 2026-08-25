/**
 * @fileoverview CheckoutSessionService
 *
 * Provides generic server-side orchestration for anonymous checkout sessions, widget token
 * initialization, draft order graph composition with polymorphic product extensions,
 * and payment completion handling.
 *
 * @module @mj-biz-apps/orders-core-entities-server/CheckoutSessionService
 */

import { BaseEntity, EntityFieldInfo, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { IdentityClaimEngineServer } from '@memberjunction/core-entities-server';
import {
    OrderHeaderEntity,
    OrderLineEntity,
    OrderPricingService,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersCheckoutSessionEntity,
    mjBizAppsOrdersCheckoutWidgetDistributionEntity,
    mjBizAppsOrdersCheckoutWidgetEntity,
    mjBizAppsOrdersPaymentIntentEntity,
    mjBizAppsOrdersProductEntity,
    mjBizAppsOrdersProductTypeEntity,
    type CheckoutWidgetConfiguration,
    type ProductTypeConfiguration
} from '@mj-biz-apps/orders-entities';
import { EscapeText } from './sql-guards.js';
import { OpenPaymentIntent } from './PaymentIntentService.js';

const CHECKOUT_WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';
const CHECKOUT_DISTRIBUTION_ENTITY = 'MJ_BizApps_Orders: Checkout Widget Distributions';
const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PERSON_ENTITY = 'MJ_BizApps_Common: People';

/**
 * Server-side quantity ceiling applied when neither `Product.MaxQuantityPerLine` nor
 * `ProductType.Configuration.maxQuantity` is configured. Without it, quantity — and the
 * per-unit line expansion driven by attendee arrays — is unbounded from an anonymous caller.
 */
const DEFAULT_MAX_QUANTITY_PER_LINE = 100;
/** Ceiling on the number of input lines a single checkout may carry. */
const MAX_LINES_PER_CHECKOUT = 50;

/** PaymentIntent statuses that satisfy the paid-order gate at completion. */
const SETTLED_INTENT_STATUSES: ReadonlyArray<string> = ['Succeeded'];

export interface InitSessionResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID?: string;
    ClientSessionKey?: string;
    WidgetID?: string;
    WidgetName?: string;
    CompanyID?: string;
    DistributionSlug?: string;
    Configuration?: CheckoutWidgetConfiguration;
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
    TotalGross?: number;
    PaymentIntentID?: string;
    ClientSecret?: string;
    /**
     * The IdentityClaim row id minted for the buyer's email (the actual verification token is
     * only ever delivered in the claim email — it is never returned through the checkout path).
     */
    ClaimToken?: string;
}

export interface OpenSessionPaymentIntentResult {
    Success: boolean;
    ErrorMessage?: string;
    SessionID: string;
    PaymentIntentID?: string;
    /** Returned to the caller for Stripe.js confirmation — never persisted. */
    ClientSecret?: string;
    Status?: string;
    Amount?: number;
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
        const escapedSlug = EscapeText(slug.trim());
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

        // Check for existing unexpired session for this client. An ISO-8601 literal compares
        // correctly on both SQL Server and PostgreSQL — GETUTCDATE() is T-SQL-only.
        const escapedKey = EscapeText(clientSessionKey.trim());
        const nowUtc = new Date().toISOString();
        const sessRes = await rv.RunView<mjBizAppsOrdersCheckoutSessionEntity>({
            EntityName: CHECKOUT_SESSION_ENTITY,
            ExtraFilter: `CheckoutWidgetID = '${widget.ID}' AND ClientSessionKey = '${escapedKey}' AND Status = 'Open' AND ExpiresAt > '${nowUtc}'`,
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
            Configuration: this.sanitizeConfigurationForClient(configObj),
            CustomCSS: configObj.customUI.css || widget.CustomCSS,
            CustomJS: configObj.customUI.js || widget.CustomJS,
            ExpiresAt: session.ExpiresAt.toISOString()
        };
    }

    /**
     * Strips obviously sensitive keys from a widget Configuration before it ships to an
     * anonymous caller. `Configuration` is admin-authored JSON with an open index signature,
     * so a future secret-shaped key (a webhook secret, an API credential, a server-side
     * payment provider ref) must never ride along to the browser. `stripePublishableKey`
     * is publishable by definition and survives.
     */
    private static sanitizeConfigurationForClient(configObj: CheckoutWidgetConfiguration): CheckoutWidgetConfiguration {
        const sensitivePattern = /secret|password|credential|privatekey|apikey|webhooksecret/i;
        const sanitized: CheckoutWidgetConfiguration = {};
        for (const [key, value] of Object.entries(configObj)) {
            if (key.toLowerCase() !== 'stripepublishablekey' && sensitivePattern.test(key)) {
                continue;
            }
            sanitized[key] = value;
        }
        return sanitized;
    }

    /**
     * Verifies a caller-presented client session key against the session row's stored key.
     * The session GUID alone must never be sufficient to drive a session — both values are
     * required on every mutating call. Constant-time comparison over char codes (this package
     * deliberately avoids Node globals, so no crypto.timingSafeEqual); a length mismatch is a
     * plain refusal — it leaks only the length, which the caller already knows from their own key.
     */
    private static verifyClientSessionKey(session: mjBizAppsOrdersCheckoutSessionEntity, clientSessionKey: string | null | undefined): boolean {
        const stored = session.ClientSessionKey ?? '';
        const presented = (clientSessionKey ?? '').trim();
        if (!stored || !presented || stored.length !== presented.length) {
            return false;
        }
        let diff = 0;
        for (let i = 0; i < stored.length; i++) {
            diff |= stored.charCodeAt(i) ^ presented.charCodeAt(i);
        }
        return diff === 0;
    }

    /**
     * Enforces the session TTL on mutating calls (it was previously only enforced at
     * session reuse). An expired-but-Open session is transitioned to 'Expired' (best-effort)
     * and refused.
     */
    private static async enforceSessionExpiry(session: mjBizAppsOrdersCheckoutSessionEntity): Promise<boolean> {
        if (session.ExpiresAt && new Date(session.ExpiresAt).getTime() <= Date.now()) {
            if (session.Status === 'Open') {
                session.Status = 'Expired';
                const saved = await session.Save();
                if (!saved) {
                    LogError(`[CheckoutSessionService] Failed to mark session ${session.ID} Expired: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
            return false;
        }
        return true;
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
            const escapedSku = EscapeText(productSku.trim());
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
     * Resolves — and optionally creates — a Person entity record based on provided fields.
     * Lookup is by normalized email. Creation only happens when `createIfMissing` is true:
     * draft updates resolve-only (so abandoned checkouts never mint Person rows), while
     * completion creates the payer/attendee records it genuinely needs.
     */
    private static async resolveOrEnsurePerson(
        fields: Record<string, unknown>,
        contextUser?: UserInfo,
        createIfMissing = true
    ): Promise<string | null> {
        const email = (fields['Email'] || fields['email'] || fields['AttendeeEmail'] || fields['attendeeEmail']) as string | undefined;
        if (!email || !email.trim()) {
            return null;
        }

        const normalized = email.trim().toLowerCase();
        const rv = new RunView();
        const escaped = EscapeText(normalized);
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

        if (!createIfMissing) {
            return null;
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
        contextUser?: UserInfo,
        createPersons = true
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

        // Auto-resolve PersonID if person fields exist on the entity or extension. Person
        // creation only happens on the completion path — draft pricing passes createPersons=false
        // so abandoned checkouts never mint Person rows.
        const resolvedPersonID = await this.resolveOrEnsurePerson(fieldValues, contextUser, createPersons);

        const excludedClientFields = new Set([
            'id',
            'orderlineid',
            'personid',
            'attendeepersonid',
            'checkinat',
            'checkedin',
            '__mj_createdat',
            '__mj_updatedat'
        ]);

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
                    const lowerKey = key.toLowerCase();
                    if (excludedClientFields.has(lowerKey) || lowerKey.startsWith('__mj_')) {
                        continue;
                    }
                    const field = extFieldsByName.get(lowerKey);
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
        clientSessionKey: string,
        email: string,
        lines: CheckoutLineInput[],
        contextUser?: UserInfo
    ): Promise<UpdateDraftResult> {
        const failed = (message: string): UpdateDraftResult => ({
            Success: false,
            ErrorMessage: message,
            SessionID: sessionID ?? '',
            Subtotal: 0,
            Tax: 0,
            Adjustments: 0,
            TotalGross: 0,
            RequiresPayment: false,
            Lines: []
        });

        if (!sessionID) {
            return failed('Session ID is required.');
        }
        if (!Array.isArray(lines) || lines.length > MAX_LINES_PER_CHECKOUT) {
            return failed(`A checkout may carry at most ${MAX_LINES_PER_CHECKOUT} lines.`);
        }

        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const sessionLoaded = await session.Load(sessionID);
        if (!sessionLoaded || session.Status !== 'Open') {
            return failed('Checkout session is not valid or has expired.');
        }
        if (!this.verifyClientSessionKey(session, clientSessionKey)) {
            return failed('Checkout session key does not match.');
        }
        if (!(await this.enforceSessionExpiry(session))) {
            return failed('Checkout session has expired.');
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

        // Resolve (never create) the payer Person by email so person-specific pricing applies
        // to the draft. Creation is deferred to completion — abandoned drafts must not mint
        // Person rows.
        if (!session.PersonID && normalizedEmail) {
            const resolvedPersonID = await this.resolveOrEnsurePerson({ Email: normalizedEmail }, contextUser, false);
            if (resolvedPersonID) {
                session.PersonID = resolvedPersonID;
            }
        }

        if (session.PersonID) {
            order.BillToPersonID = session.PersonID;
            order.ShipToPersonID = session.PersonID;
        }

        let sequence = 1;
        for (const inputLine of lines) {
            // Validate quantity: must be positive integer >= 1
            if (!Number.isInteger(inputLine.Quantity) || inputLine.Quantity < 1) {
                return failed(`Invalid quantity: quantity must be a positive integer (received ${inputLine.Quantity})`);
            }

            let targetExtensionEntity: string | null = null;
            let maxQuantityPerLine: number | null = null;
            let unitMode: 'perUnit' | 'perLine' = 'perLine';

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
                                targetExtensionEntity = pType.OrderLineExtensionEntity ?? null;
                                if (pType.Configuration) {
                                    try {
                                        const pTypeConfig = JSON.parse(pType.Configuration) as ProductTypeConfiguration;
                                        if (pTypeConfig.unitMode) {
                                            unitMode = pTypeConfig.unitMode;
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

            const effectiveMax = maxQuantityPerLine ?? DEFAULT_MAX_QUANTITY_PER_LINE;
            if (inputLine.Quantity > effectiveMax) {
                return failed(`Quantity ${inputLine.Quantity} exceeds maximum allowed quantity of ${effectiveMax} for this item`);
            }

            const unitPayloads = this.extractUnitPayloads(inputLine);
            if (unitPayloads.length > effectiveMax) {
                return failed(`Unit payload count ${unitPayloads.length} exceeds maximum allowed quantity of ${effectiveMax} for this item`);
            }

            if ((unitMode === 'perUnit' || unitPayloads.length > 1) && unitPayloads.length > 0) {
                for (const unitData of unitPayloads) {
                    const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                    line.ProductID = inputLine.ProductID;
                    line.Quantity = 1;
                    line.LineNumber = sequence++;

                    await this.hydrateLineExtension(line, targetExtensionEntity, unitData, contextUser, false);
                }
            } else {
                const line = await this.createOrderLine(order, targetExtensionEntity, md, contextUser);
                line.ProductID = inputLine.ProductID;
                line.Quantity = inputLine.Quantity;
                line.LineNumber = sequence++;

                if (unitPayloads.length > 0) {
                    await this.hydrateLineExtension(line, targetExtensionEntity, unitPayloads[0], contextUser, false);
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
            ExtendedPrice: l.LineTotalGross ?? ((l.UnitPrice ?? 0) * (l.Quantity ?? 1)),
            Description: l.Description ?? undefined
        }));

        // A previously opened payment intent was priced against the OLD snapshot. If the total
        // changed, detach it so the completion gate can't accept a stale (higher OR lower)
        // authorized amount — the caller must reopen the intent against the new total.
        let previousTotal: number | undefined;
        if (session.MetadataJSON) {
            try {
                previousTotal = (JSON.parse(session.MetadataJSON) as { TotalGross?: number }).TotalGross;
            } catch {
                previousTotal = undefined;
            }
        }
        if (session.PaymentIntentID && previousTotal !== order.TotalGross) {
            session.PaymentIntentID = null;
        }

        // Store checkout state in session metadata JSON — no orphan OrderHeader rows
        session.MetadataJSON = JSON.stringify({
            Lines: lines,
            PricedLines: lineSummaries,
            TotalGross: order.TotalGross,
            UpdatedAt: new Date().toISOString()
        });
        const sessionSaved = await session.Save();
        if (!sessionSaved) {
            return failed(`Failed to persist checkout state: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        return {
            Success: true,
            SessionID: sessionID,
            OrderID: session.DraftOrderID || '',
            OrderNumber: '',
            Subtotal: order.TotalGross ?? 0,
            Tax: 0,
            Adjustments: 0,
            TotalGross: order.TotalGross ?? 0,
            RequiresPayment: (order.TotalGross ?? 0) > 0,
            Lines: lineSummaries
        };
    }

    /**
     * Opens (or idempotently re-opens) a payment intent for a session's CURRENT server-priced
     * total. This is the only way a checkout session acquires a `PaymentIntentID`.
     *
     * Everything money-shaped is resolved server-side, per the checkout pricing-input rule:
     * the amount comes from the session's own priced snapshot (never the client), and the
     * payment provider comes from the widget's admin-authored Configuration
     * (`paymentProviderId`) — the client supplies only its session id + key. The gateway
     * client secret is returned for Stripe.js confirmation and never persisted.
     */
    public static async OpenPaymentIntentForSession(
        sessionID: string,
        clientSessionKey: string,
        contextUser?: UserInfo
    ): Promise<OpenSessionPaymentIntentResult> {
        const failed = (message: string): OpenSessionPaymentIntentResult => ({
            Success: false,
            ErrorMessage: message,
            SessionID: sessionID ?? ''
        });

        if (!sessionID) {
            return failed('Session ID is required.');
        }
        if (!contextUser) {
            return failed('A context user is required to open a payment intent.');
        }

        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const loaded = await session.Load(sessionID);
        if (!loaded || session.Status !== 'Open') {
            return failed('Checkout session is not valid or has expired.');
        }
        if (!this.verifyClientSessionKey(session, clientSessionKey)) {
            return failed('Checkout session key does not match.');
        }
        if (!(await this.enforceSessionExpiry(session))) {
            return failed('Checkout session has expired.');
        }

        // The amount is the session's own server-priced snapshot — never a caller input.
        let snapshotTotal = 0;
        if (session.MetadataJSON) {
            try {
                const parsed = JSON.parse(session.MetadataJSON) as { TotalGross?: number };
                snapshotTotal = typeof parsed.TotalGross === 'number' ? parsed.TotalGross : 0;
            } catch {
                snapshotTotal = 0;
            }
        }
        if (!(snapshotTotal > 0)) {
            return failed('This checkout has no balance due — complete it directly without a payment intent.');
        }

        const widget = await md.GetEntityObject<mjBizAppsOrdersCheckoutWidgetEntity>(CHECKOUT_WIDGET_ENTITY, contextUser);
        const widgetLoaded = await widget.Load(session.CheckoutWidgetID);
        if (!widgetLoaded) {
            return failed('The checkout widget for this session could not be loaded.');
        }

        let paymentProviderId: string | undefined;
        let currencyCode: string | undefined;
        if (widget.Configuration) {
            try {
                const configObj = JSON.parse(widget.Configuration) as CheckoutWidgetConfiguration;
                paymentProviderId = typeof configObj.paymentProviderId === 'string' ? configObj.paymentProviderId : undefined;
                currencyCode = typeof configObj.currency === 'string' ? configObj.currency : undefined;
            } catch {
                // Malformed configuration already fails InitializeSession; treat as unset here.
            }
        }
        if (!paymentProviderId) {
            return failed(`Checkout widget '${widget.Name}' has no paymentProviderId configured — a paid checkout requires one.`);
        }

        const mdProvider = Metadata.Provider;
        if (!mdProvider) {
            return failed('No metadata provider is available to open a payment intent.');
        }

        const openResult = await OpenPaymentIntent({
            PaymentProviderID: paymentProviderId,
            Amount: snapshotTotal,
            CurrencyCode: currencyCode,
            BillToPersonID: session.PersonID ?? undefined,
            // Stable per-session idempotency key: reopening for the same session+amount
            // returns the SAME gateway intent instead of minting a fresh one per retry.
            IdempotencyKey: `checkout-${sessionID}-${Math.round(snapshotTotal * 100)}`,
            Metadata: { CheckoutSessionID: sessionID }
        }, mdProvider, contextUser);

        if (!openResult.Success || !openResult.PaymentIntentID) {
            return failed(openResult.Reason ?? 'The payment provider refused to open an intent.');
        }

        session.PaymentIntentID = openResult.PaymentIntentID;
        const saved = await session.Save();
        if (!saved) {
            return failed(`Failed to attach the payment intent to the session: ${session.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        return {
            Success: true,
            SessionID: sessionID,
            PaymentIntentID: openResult.PaymentIntentID,
            ClientSecret: openResult.ClientSecret,
            Status: openResult.Status,
            Amount: snapshotTotal
        };
    }

    /**
     * Completes an existing CheckoutSession, constructing the final Order,
     * executing lifecycle confirmation (with accounting GL bookings and deferred revenue),
     * and generating a claim token if unauthenticated.
     */
    public static async CompleteCheckout(
        sessionID: string,
        clientSessionKey: string,
        contextUser?: UserInfo
    ): Promise<CompleteCheckoutResult> {
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsOrdersCheckoutSessionEntity>(CHECKOUT_SESSION_ENTITY, contextUser);
        const loaded = await session.Load(sessionID);
        if (!loaded) {
            return {
                Success: false,
                ErrorMessage: 'Checkout session not found',
                SessionID: sessionID,
                Status: 'Unknown'
            };
        }
        if (!this.verifyClientSessionKey(session, clientSessionKey)) {
            return {
                Success: false,
                ErrorMessage: 'Checkout session key does not match',
                SessionID: sessionID,
                Status: session.Status
            };
        }

        // Replay safety: a session that already completed returns its existing order rather
        // than an error — a network retry after a successful booking must never double-book
        // and must never strand the buyer without their order id.
        if (session.Status === 'Confirmed' && session.DraftOrderID) {
            const existingOrder = await md.GetEntityObject<OrderHeaderEntity>(ORDER_HEADER_ENTITY, contextUser);
            const orderLoaded = await existingOrder.Load(session.DraftOrderID);
            return {
                Success: true,
                SessionID: sessionID,
                Status: 'Confirmed',
                OrderID: session.DraftOrderID,
                OrderNumber: orderLoaded ? (existingOrder.OrderNumber || session.DraftOrderID) : session.DraftOrderID,
                TotalGross: orderLoaded ? (existingOrder.TotalGross ?? undefined) : undefined
            };
        }

        if (session.Status !== 'Open') {
            return {
                Success: false,
                ErrorMessage: 'Session is not in an Open status',
                SessionID: sessionID,
                Status: session.Status
            };
        }
        if (!(await this.enforceSessionExpiry(session))) {
            return {
                Success: false,
                ErrorMessage: 'Checkout session has expired',
                SessionID: sessionID,
                Status: 'Expired'
            };
        }

        // Atomically latch status to Processing to prevent concurrent duplicate checkout processing
        const latched = await this.latchSessionProcessingAtomic(sessionID, md, contextUser);
        if (!latched) {
            return {
                Success: false,
                ErrorMessage: 'Session is not in an Open status or was concurrently processed',
                SessionID: sessionID,
                Status: session?.Status ?? 'Unknown'
            };
        }
        session.Status = 'Processing';

        // Set the moment order.Confirm() commits; controls the catch's no-revert posture.
        let confirmedOrderID: string | null = null;

        try {
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

            // Resolve — creating if necessary — the payer Person. OrderHeaderEntity.Validate()
            // refuses to confirm an order without a customer, so a missing payer must fail
            // HERE with a clear message, not deep inside Confirm(). Contact fields come from
            // the first unit payload (name etc.); the email is the session's captured email.
            if (!session.PersonID) {
                const firstPayload = linesInput.length > 0 ? this.extractUnitPayloads(linesInput[0])[0] ?? {} : {};
                const payerFields: Record<string, unknown> = { ...firstPayload, Email: session.Email ?? '' };
                // A simple-product guest checkout collects only an email — derive a name from
                // the local part so the payer Person can be created. The GuestOrder identity
                // claim later re-parents the order to the buyer's real account identity.
                const hasName = payerFields['FirstName'] || payerFields['firstName'] || payerFields['LastName'] || payerFields['lastName'] || payerFields['Name'] || payerFields['name'] || payerFields['AttendeeName'];
                if (!hasName && session.Email) {
                    const localPart = session.Email.split('@')[0]?.trim();
                    if (localPart) {
                        payerFields['Name'] = localPart;
                    }
                }
                const payerPersonID = await this.resolveOrEnsurePerson(payerFields, contextUser, true);
                if (payerPersonID) {
                    session.PersonID = payerPersonID;
                }
            }
            if (!session.PersonID) {
                await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                session.Status = 'Open';
                return {
                    Success: false,
                    ErrorMessage: 'A buyer email (and name for a new customer) is required to complete checkout',
                    SessionID: sessionID,
                    Status: 'Open'
                };
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
                // Validate quantity: must be positive integer >= 1
                if (!Number.isInteger(inputLine.Quantity) || inputLine.Quantity < 1) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: `Invalid quantity: quantity must be a positive integer (received ${inputLine.Quantity})`,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }

                let targetExtensionEntity: string | null = null;
                let maxQuantityPerLine: number | null = null;
                let unitMode: 'perUnit' | 'perLine' = 'perLine';

                if (inputLine.ProductID) {
                    try {
                        const product = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, contextUser);
                        if (await product.Load(inputLine.ProductID)) {
                            maxQuantityPerLine = product.MaxQuantityPerLine ?? null;
                            if (product.ProductTypeID) {
                                const pType = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, contextUser);
                                if (await pType.Load(product.ProductTypeID)) {
                                    targetExtensionEntity = pType.OrderLineExtensionEntity ?? null;
                                    if (pType.Configuration) {
                                        try {
                                            const pTypeConfig = JSON.parse(pType.Configuration) as ProductTypeConfiguration;
                                            if (pTypeConfig.unitMode) unitMode = pTypeConfig.unitMode;
                                            if (pTypeConfig.maxQuantity && !maxQuantityPerLine) maxQuantityPerLine = pTypeConfig.maxQuantity;
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

                const effectiveMax = maxQuantityPerLine ?? DEFAULT_MAX_QUANTITY_PER_LINE;
                if (inputLine.Quantity > effectiveMax) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: `Quantity ${inputLine.Quantity} exceeds maximum allowed quantity of ${effectiveMax} for this item`,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }

                const unitPayloads = this.extractUnitPayloads(inputLine);
                if (unitPayloads.length > effectiveMax) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: `Unit payload count ${unitPayloads.length} exceeds maximum allowed quantity of ${effectiveMax} for this item`,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }

                if ((unitMode === 'perUnit' || unitPayloads.length > 1) && unitPayloads.length > 0) {
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

            // Money-path safety: a paid order confirms only against a payment intent whose
            // STATE and AMOUNT check out server-side. Mere existence of an intent id is not
            // payment — an opened-but-unpaid intent must never book an order. Intent status is
            // driven by the signature-verified payment webhook (PaymentWebhookHandler), never
            // by anything the client asserts.
            if (order.TotalGross > 0) {
                const paymentFailure = await this.verifySessionPayment(session, order.TotalGross, md, contextUser);
                if (paymentFailure) {
                    await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
                    session.Status = 'Open';
                    return {
                        Success: false,
                        ErrorMessage: paymentFailure,
                        SessionID: sessionID,
                        Status: 'Open'
                    };
                }
            }

            // Confirm order via BaseEntity lifecycle (executes GL booking, entitlement issuance, status latching)
            await order.Confirm();
            confirmedOrderID = order.ID;

            // The order is now COMMITTED — from this point nothing may revert the session to
            // Open, or a retry would book a second order for the same purchase. Session
            // stamping failures are logged and repaired atomically, never surfaced as a
            // checkout failure.
            session.Status = 'Confirmed';
            session.DraftOrderID = order.ID;
            const stamped = await session.Save();
            if (!stamped) {
                LogError(`[CheckoutSessionService] Session ${sessionID} completed order ${order.ID} but the entity save failed (${session.LatestResult?.CompleteMessage ?? 'unknown error'}) — falling back to atomic stamp`);
                await CheckoutSessionService.stampSessionConfirmedAtomic(sessionID, order.ID, md, contextUser);
            }

            // Mint the GuestOrder identity claim for the buyer's email so a later account
            // (MJ core's IdentityClaimEngineServer) can attach the order + its entitlement
            // grants on redemption or claim-on-login. Best-effort: a claim failure must never
            // fail a booked order — but it is logged, never swallowed silently.
            let claimToken: string | undefined;
            if (session.Email) {
                try {
                    const claim = await IdentityClaimEngineServer.Instance.CreateClaim({
                        ClaimTypeName: 'GuestOrder',
                        RecordID: order.ID,
                        EntityID: md.EntityByName(ORDER_HEADER_ENTITY)?.ID ?? null,
                        NormalizedEmail: session.Email,
                        Payload: { OrderID: order.ID, OrderNumber: order.OrderNumber || order.ID },
                        SendEmail: true
                    }, contextUser);
                    claimToken = claim?.ID;
                } catch (claimErr) {
                    const claimMsg = claimErr instanceof Error ? claimErr.message : String(claimErr);
                    LogError(`[CheckoutSessionService] GuestOrder claim minting failed for order ${order.ID} (${session.Email}): ${claimMsg}`);
                }
            }

            return {
                Success: true,
                OrderID: order.ID,
                OrderNumber: order.OrderNumber || order.ID,
                TotalGross: order.TotalGross ?? sumGross,
                SessionID: sessionID,
                Status: 'Confirmed',
                ClaimToken: claimToken
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (confirmedOrderID) {
                // Post-commit failure: the order EXISTS. Do not revert the latch (a retry would
                // double-book); stamp the session Confirmed atomically and report success.
                LogError(`[CheckoutSessionService] CompleteCheckout post-confirm failure for session ${sessionID} (order ${confirmedOrderID}): ${msg}`);
                await CheckoutSessionService.stampSessionConfirmedAtomic(sessionID, confirmedOrderID, md, contextUser);
                return {
                    Success: true,
                    OrderID: confirmedOrderID,
                    SessionID: sessionID,
                    Status: 'Confirmed'
                };
            }
            await CheckoutSessionService.revertSessionOpenAtomic(sessionID, md, contextUser);
            session.Status = 'Open';
            LogError(`[CheckoutSessionService] CompleteCheckout failed for session ${sessionID}: ${msg}`);
            return {
                Success: false,
                ErrorMessage: `Failed to complete checkout: ${msg}`,
                SessionID: sessionID,
                Status: 'Open'
            };
        }
    }

    /**
     * Verifies the paid-order gate for a session against a server-computed total. Returns a
     * refusal message, or null when payment checks out. The intent must exist, belong to this
     * session, be in a settled state, and cover the freshly re-priced total.
     */
    private static async verifySessionPayment(
        session: mjBizAppsOrdersCheckoutSessionEntity,
        totalGross: number,
        md: Metadata,
        contextUser?: UserInfo
    ): Promise<string | null> {
        if (!session.PaymentIntentID) {
            return 'Cannot confirm paid order (TotalGross > 0) without a payment intent for this session';
        }
        const intent = await md.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, contextUser);
        const intentLoaded = await intent.Load(session.PaymentIntentID);
        if (!intentLoaded) {
            return 'The payment intent attached to this session could not be found';
        }
        if (!SETTLED_INTENT_STATUSES.includes(intent.Status)) {
            // Intent state is advanced by the signature-verified payment webhook. An intent
            // still in Processing/RequiresPayment means payment has not settled yet — the
            // client should retry completion after payment confirmation lands.
            return `Payment has not settled (intent status: ${intent.Status}). Complete payment and try again.`;
        }
        // Half-cent tolerance absorbs decimal rounding between the priced total and the
        // cents-rounded intent amount.
        if ((intent.Amount ?? 0) + 0.005 < totalGross) {
            return `The settled payment amount (${intent.Amount}) does not cover the order total (${totalGross})`;
        }
        return null;
    }

    /**
     * Atomically stamps a Processing session as Confirmed with its completed order id — the
     * repair path when the entity-level save cannot run after the order has committed.
     */
    private static async stampSessionConfirmedAtomic(sessionID: string, orderID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (Metadata.Provider || (Metadata as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === CHECKOUT_SESSION_ENTITY);
            const schemaName = entityInfo?.SchemaName ?? '__mj_BizAppsOrders';
            const tableName = entityInfo?.BaseTable ?? 'CheckoutSession';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Confirmed', "DraftOrderID" = $2 WHERE "ID" = $1 AND "Status" = 'Processing' RETURNING "ID";`
                : `DECLARE @stamped TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Confirmed', [DraftOrderID] = @p1 OUTPUT INSERTED.ID INTO @stamped WHERE [ID] = @p0 AND [Status] = 'Processing'; SELECT ID FROM @stamped;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [sessionID, orderID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[CheckoutSessionService] stampSessionConfirmedAtomic failed for session ${sessionID}: ${msg}`);
            return false;
        }
    }

    /**
     * Executes atomic single-use Compare-And-Swap (CAS) state transition on CheckoutSession
     * from 'Open' to 'Processing'. Returns true iff this execution successfully transitioned the record.
     */
    private static async latchSessionProcessingAtomic(sessionID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (Metadata.Provider || (Metadata as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                LogError('latchSessionProcessingAtomic: provider or ExecuteSQL not available for atomic CAS');
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === CHECKOUT_SESSION_ENTITY);
            const schemaName = entityInfo?.SchemaName ?? '__mj_BizAppsOrders';
            const tableName = entityInfo?.BaseTable ?? 'CheckoutSession';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Processing' WHERE "ID" = $1 AND "Status" = 'Open' RETURNING "ID";`
                : `DECLARE @latched TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Processing' OUTPUT INSERTED.ID INTO @latched WHERE [ID] = @p0 AND [Status] = 'Open'; SELECT ID FROM @latched;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [sessionID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch {
            return false;
        }
    }

    /**
     * Reverts atomic CAS state from 'Processing' back to 'Open' if order confirmation fails.
     */
    private static async revertSessionOpenAtomic(sessionID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (Metadata.Provider || (Metadata as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === CHECKOUT_SESSION_ENTITY);
            const schemaName = entityInfo?.SchemaName ?? '__mj_BizAppsOrders';
            const tableName = entityInfo?.BaseTable ?? 'CheckoutSession';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Open' WHERE "ID" = $1 AND "Status" = 'Processing' RETURNING "ID";`
                : `DECLARE @reverted TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Open' OUTPUT INSERTED.ID INTO @reverted WHERE [ID] = @p0 AND [Status] = 'Processing'; SELECT ID FROM @reverted;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [sessionID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[CheckoutSessionService] revertSessionOpenAtomic failed for session ${sessionID}: ${msg}`);
            return false;
        }
    }
}

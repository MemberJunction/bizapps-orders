/**
 * @fileoverview Configuration JSON Types for BizApps Orders
 *
 * Defines strongly-typed JSON configuration schemas for Product Types, Checkout Widgets,
 * and custom UI pluggability (custom JS lifecycle hooks, scoped CSS, themes, and component overrides).
 *
 * @module @mj-biz-apps/orders-entities/configuration-types
 */

export interface CustomUIThemeConfiguration {
    primaryColor?: string;
    accentColor?: string;
    borderRadius?: string;
    fontFamily?: string;
    backgroundColor?: string;
    textColor?: string;
    [key: string]: unknown;
}

export interface CustomUIConfiguration {
    /**
     * Custom JavaScript code string containing lifecycle hooks or UI handlers.
     */
    js?: string;
    /**
     * Custom CSS stylesheet string containing scoped styling rules.
     */
    css?: string;
    /**
     * Theme tokens and color customizations.
     */
    theme?: CustomUIThemeConfiguration;
    /**
     * Registered custom component override key/class name.
     */
    componentOverrideKey?: string;
    /**
     * Additional UI settings and options.
     */
    [key: string]: unknown;
}

export interface FieldOverrideConfiguration {
    label?: string;
    placeholder?: string;
    hidden?: boolean;
    required?: boolean;
    defaultValue?: unknown;
    order?: number;
    options?: Array<{ label: string; value: string | number }>;
    [key: string]: unknown;
}

export interface ProductTypeConfiguration {
    /**
     * Unit mode: 'perUnit' (discrete repeating fieldsets) vs 'perLine' (single fieldset for the line).
     */
    unitMode?: 'perUnit' | 'perLine';
    /**
     * Maximum quantity allowed per order or line.
     */
    maxQuantity?: number;
    /**
     * Whether quantity selection is permitted in self-service checkout surfaces.
     */
    allowQuantity?: boolean;
    /**
     * Field overrides and customizations for line extension entity fields.
     */
    fieldOverrides?: Record<string, FieldOverrideConfiguration>;
    /**
     * Custom UI section containing JS hooks, scoped CSS, theme tokens, and component overrides.
     */
    customUI?: CustomUIConfiguration;
    /**
     * Extensible custom properties.
     */
    [key: string]: unknown;
}

export interface CheckoutWidgetConfiguration {
    title?: string;
    description?: string;
    productId?: string;
    /**
     * Explicit catalog this widget may sell. The anonymous draft edge rejects any
     * ProductID not in this list (plus `productId` / SKU-resolved id). An empty
     * catalog is a misconfiguration and the draft is refused, unless
     * `allowAnyProduct` is explicitly true.
     */
    allowedProductIds?: string[];
    /**
     * When true, this widget sells any product that shares its CompanyID — an
     * explicit open catalog, not the default. Absence of `productId` /
     * `allowedProductIds` is NOT an open catalog. Requires the widget
     * CompanyID (fail-closed if unset). Server-side only.
     */
    allowAnyProduct?: boolean;
    /** Alternative product resolution by SKU when productId is not set. */
    productSku?: string;
    productName?: string;
    unitPrice?: number;
    currency?: string;
    unitMode?: 'perUnit' | 'perLine';
    allowQuantity?: boolean;
    maxQuantity?: number;
    stripePublishableKey?: string;
    successMessage?: string;
    redirectUrl?: string;
    extensionEntityName?: string;
    /**
     * Metadata-driven form field specs — auto-discovered from the product type's extension
     * entity when not explicitly authored.
     */
    extensionFields?: Array<{
        name: string;
        label: string;
        type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select';
        required?: boolean;
        placeholder?: string;
        options?: Array<string | { label: string; value: string | number }>;
    }>;
    /**
     * The PaymentProvider row id used to open payment intents for this widget's sessions.
     * Admin-authored, server-resolved — never accepted from the client. Required before a
     * paid checkout can complete.
     */
    paymentProviderId?: string;
    /**
     * `PaymentType.Code` used when CompleteCheckout books `Orders.CapturePayment`
     * (e.g. `CreditCard`, `ACH`). Server-side only. Defaults to `CreditCard`.
     */
    tenderCode?: string;
    /**
     * Origins (scheme + host [+ port]) allowed to embed and drive this widget through the
     * anonymous checkout edge. When set, requests whose Origin header does not match are
     * refused and receive no CORS grant. When absent, the edge allows any origin (the
     * distribution slug remains the access control).
     */
    allowedOrigins?: string[];
    /**
     * When true, the anonymous checkout edge requires a Cloudflare Turnstile token on
     * session initialization and completion (the edge must also be configured with a
     * Turnstile secret for verification to run — fail-closed when it is not).
     */
    requireTurnstile?: boolean;
    /**
     * Custom UI section containing JS hooks, scoped CSS, theme tokens, and component overrides.
     */
    customUI?: CustomUIConfiguration;
    /**
     * Extensible custom properties.
     */
    [key: string]: unknown;
}

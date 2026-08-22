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
     * Custom UI section containing JS hooks, scoped CSS, theme tokens, and component overrides.
     */
    customUI?: CustomUIConfiguration;
    /**
     * Extensible custom properties.
     */
    [key: string]: unknown;
}

/**
 * Browser entry for the `<mj-orders-checkout>` Angular Element.
 * Bundled against the ngc-compiled library (templates already inlined).
 */
import 'zone.js';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { CheckoutPublicHostComponent } from '../dist/lib/checkout-widget/checkout-public-host.component.js';

void createApplication({ providers: [] })
    .then((app) => {
        if (!customElements.get('mj-orders-checkout')) {
            const el = createCustomElement(CheckoutPublicHostComponent, { injector: app.injector });
            customElements.define('mj-orders-checkout', el);
        }
    })
    .catch((err: unknown) => {
        console.error('[mj-orders-checkout] bootstrap failed', err);
    });

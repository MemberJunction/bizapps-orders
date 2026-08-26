/**
 * Browser entry for the `<mj-orders-checkout>` Angular Element.
 * Bundled with the Angular linker (see build-checkout-element.mjs) so the
 * payment page does not need `unsafe-eval` / JIT.
 */
import 'zone.js';
import { CSP_NONCE, provideZoneChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { CheckoutPublicHostComponent } from '../dist/lib/checkout-widget/checkout-public-host.component.js';

function readCspNonce(): string {
    const host = document.querySelector('mj-orders-checkout');
    const fromHost = host?.getAttribute('csp-nonce') || host?.getAttribute('ngcspnonce');
    if (fromHost) {
        return fromHost;
    }
    const tagged = document.querySelector<HTMLElement>('script[nonce], style[nonce]');
    return tagged?.nonce || tagged?.getAttribute('nonce') || '';
}

void createApplication({
    providers: [
        provideZoneChangeDetection(),
        { provide: CSP_NONCE, useFactory: readCspNonce },
    ],
})
    .then((app) => {
        if (!customElements.get('mj-orders-checkout')) {
            const el = createCustomElement(CheckoutPublicHostComponent, { injector: app.injector });
            customElements.define('mj-orders-checkout', el);
        }
    })
    .catch((err: unknown) => {
        console.error('[mj-orders-checkout] bootstrap failed', err);
    });

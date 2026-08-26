/**
 * Public checkout host page — a self-contained HTML document that drives
 * `OrdersCheckoutEdge` POSTs from a browser with no Explorer shell and no
 * custom-element bundle.
 *
 * All per-request values reach the boot script via HTML-escaped `data-*`
 * attributes (Forms host-page XSS rule): nothing attacker-controlled is
 * interpolated into the inline `<script>`.
 */

export interface CheckoutHostPageOptions {
    /** Distribution slug from `GET /checkout/:slug`. */
    slug: string;
    /**
     * URL prefix the boot script POSTs to (the extension RootPath, e.g. `/checkout`).
     * Relative so the page works behind whatever public origin MJAPI is served on.
     */
    apiRoot: string;
    /** Browser tab title before initialize returns the widget name. */
    pageTitle?: string;
    /** Per-response CSP nonce for the inline style and boot script. */
    cspNonce?: string;
}

export interface CheckoutHostErrorOptions {
    message: string;
    pageTitle?: string;
    cspNonce?: string;
}

/** Headers for the public checkout host / error pages (CSP is nonce-based). */
export function checkoutHostSecurityHeaders(nonce: string): Record<string, string> {
    const n = nonce.replace(/[^A-Za-z0-9+/=_-]/g, '');
    const csp = [
        "default-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
        `script-src 'nonce-${n}' https://js.stripe.com`,
        `style-src 'nonce-${n}'`,
        "img-src 'self' data: https://*.stripe.com",
        'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://*.stripe.com https://*.hcaptcha.com https://newassets.hcaptcha.com',
        "connect-src 'self' https://api.stripe.com https://m.stripe.network",
    ].join('; ');
    return {
        'Content-Security-Policy': csp,
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
    };
}

/** Escape a string for safe insertion into HTML text content. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Escape a string for safe insertion into a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/"/g, '&quot;');
}

export function renderCheckoutHostPage(options: CheckoutHostPageOptions): string {
    const title = escapeHtml(options.pageTitle ?? 'Checkout');
    const slug = escapeAttr(options.slug);
    const apiRoot = escapeAttr(options.apiRoot);
    const nonceAttr = options.cspNonce ? ` nonce="${escapeAttr(options.cspNonce)}"` : '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
</head>
<body>
  <main class="mj-co" id="mj-co" data-slug="${slug}" data-api-root="${apiRoot}">
    <p class="mj-co__status" role="status">Loading checkout…</p>
  </main>
  <script${nonceAttr}>${BOOT_SCRIPT}</script>
</body>
</html>`;
}

export function renderCheckoutHostErrorPage(options: CheckoutHostErrorOptions): string {
    const title = escapeHtml(options.pageTitle ?? 'Checkout unavailable');
    const message = escapeHtml(options.message);
    const nonceAttr = options.cspNonce ? ` nonce="${escapeAttr(options.cspNonce)}"` : '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style${nonceAttr}>${PAGE_CSS}</style>
</head>
<body>
  <main class="mj-co">
    <p class="mj-co__error" role="alert">${message}</p>
  </main>
</body>
</html>`;
}

const PAGE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body {
  background: var(--mj-bg, #f6f7f9);
  color: var(--mj-text, #1a1a1a);
  font-family: var(--mj-font-body, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  -webkit-text-size-adjust: 100%;
}
.mj-co {
  max-width: 32rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 5vw, 3rem) clamp(1rem, 4vw, 2rem);
}
.mj-co__status, .mj-co__error, .mj-co__ok {
  font-size: 1.0625rem;
  line-height: 1.5;
}
.mj-co__error { color: var(--mj-error, #b3261e); }
.mj-co__ok { color: var(--mj-ok, #0f7b3b); }
.mj-co h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
.mj-co p { margin: 0 0 1rem; }
.mj-co label { display: block; font-weight: 600; margin: 0.75rem 0 0.25rem; }
.mj-co input, .mj-co select, .mj-co textarea {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--mj-border, #c9cdd4);
  border-radius: 6px;
  font: inherit;
  background: var(--mj-surface, #fff);
  color: inherit;
}
.mj-co button {
  margin-top: 1.25rem;
  padding: 0.65rem 1.1rem;
  border: 0;
  border-radius: 6px;
  background: var(--mj-primary, #2563eb);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.mj-co button[disabled] { opacity: 0.6; cursor: not-allowed; }
.mj-co__total { font-weight: 600; margin-top: 1rem; }
#mj-co-card { margin-top: 1rem; }
`;

/**
 * Static boot script. Per-request values are read from `#mj-co` data-* attributes
 * at runtime — never spliced into this string.
 */
const BOOT_SCRIPT = `
(function () {
  var host = document.getElementById('mj-co');
  var slug = host.getAttribute('data-slug') || '';
  var apiRoot = (host.getAttribute('data-api-root') || '/checkout').replace(/\\/+$/, '');

  function showError(msg) {
    host.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'mj-co__error';
    p.setAttribute('role', 'alert');
    p.textContent = msg;
    host.appendChild(p);
  }
  function setStatus(msg) {
    var el = host.querySelector('.mj-co__status');
    if (el) el.textContent = msg;
  }
  function clientKey() {
    var storageKey = 'mj-checkout-key:' + slug;
    try {
      var existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
    } catch (e) {}
    var key;
    if (window.crypto && crypto.randomUUID) {
      key = crypto.randomUUID();
    } else if (window.crypto && crypto.getRandomValues) {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) hex.push(('0' + b[i].toString(16)).slice(-2));
      key = hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
    } else {
      showError('Checkout requires a secure random source. Open this page over HTTPS.');
      return '';
    }
    try { sessionStorage.setItem(storageKey, key); } catch (e) {}
    return key;
  }
  function post(path, body) {
    return fetch(apiRoot + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (json) {
        json._httpStatus = res.status;
        return json;
      });
    });
  }
  function fieldValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return el.value === '' ? '' : Number(el.value);
    return el.value;
  }
  function loadStripe(pk) {
    return new Promise(function (resolve, reject) {
      // Reuse the same Stripe instance that created the Card Element. A second
      // Stripe(pk) object cannot confirm that element (Stripe.js throws).
      if (stripe) { resolve(stripe); return; }
      function inst() {
        stripe = window.Stripe(pk);
        resolve(stripe);
      }
      if (window.Stripe) { inst(); return; }
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload = function () {
        if (!window.Stripe) { reject(new Error('Stripe.js did not load')); return; }
        inst();
      };
      s.onerror = function () { reject(new Error('Could not load Stripe.js')); };
      document.head.appendChild(s);
    });
  }

  if (!slug) {
    showError('This checkout link is missing its reference. Please check the link and try again.');
    return;
  }

  var sessionKey = clientKey();
  if (!sessionKey) return;
  var sessionId = '';
  var config = {};
  var stripe = null;
  var cardElement = null;

  post('/initialize', { slug: slug, clientSessionKey: sessionKey }).then(function (init) {
    if (!init || !init.Success) {
      showError((init && init.ErrorMessage) || 'This checkout is not available.');
      return;
    }
    sessionId = init.SessionID;
    config = init.Configuration || {};
    var productId = config.productId;
    if (!productId) {
      showError('This checkout is not configured with a product.');
      return;
    }

    host.innerHTML = '';
    var h1 = document.createElement('h1');
    h1.textContent = config.title || init.WidgetName || 'Checkout';
    host.appendChild(h1);
    if (config.description) {
      var desc = document.createElement('p');
      desc.textContent = config.description;
      host.appendChild(desc);
    }

    var form = document.createElement('form');
    form.setAttribute('novalidate', 'novalidate');

    function addField(name, label, type, required, placeholder, options) {
      var lab = document.createElement('label');
      lab.setAttribute('for', 'mj-co-' + name);
      lab.textContent = label + (required ? ' *' : '');
      form.appendChild(lab);
      var input;
      if (type === 'select' && options && options.length) {
        input = document.createElement('select');
        var blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '';
        input.appendChild(blank);
        options.forEach(function (opt) {
          var o = document.createElement('option');
          if (typeof opt === 'object' && opt) {
            o.value = String(opt.value);
            o.textContent = String(opt.label);
          } else {
            o.value = String(opt);
            o.textContent = String(opt);
          }
          input.appendChild(o);
        });
      } else if (type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else if (type === 'boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
      } else {
        input = document.createElement('input');
        input.type = type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text');
      }
      input.id = 'mj-co-' + name;
      input.name = name;
      if (placeholder && input.placeholder !== undefined) input.placeholder = placeholder;
      if (required && input.type !== 'checkbox') input.required = true;
      form.appendChild(input);
      return input;
    }

    addField('email', 'Email', 'text', true, 'you@example.com');
    var qtyInput = null;
    if (config.allowQuantity !== false) {
      qtyInput = addField('quantity', 'Quantity', 'number', true, '1');
      qtyInput.min = '1';
      qtyInput.value = '1';
      if (config.maxQuantity) qtyInput.max = String(config.maxQuantity);
    }

    var extFields = Array.isArray(config.extensionFields) ? config.extensionFields : [];
    extFields.forEach(function (f) {
      if (!f || !f.name || f.name === 'email') return;
      addField(f.name, f.label || f.name, f.type || 'text', !!f.required, f.placeholder || '', f.options);
    });

    var cardMount = document.createElement('div');
    cardMount.id = 'mj-co-card';
    form.appendChild(cardMount);

    var totalEl = document.createElement('p');
    totalEl.className = 'mj-co__total';
    form.appendChild(totalEl);

    var status = document.createElement('p');
    status.className = 'mj-co__status';
    status.setAttribute('role', 'status');
    form.appendChild(status);

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Continue';
    form.appendChild(submit);
    host.appendChild(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      submit.disabled = true;
      status.textContent = 'Pricing…';
      var emailEl = form.elements.namedItem('email');
      var email = emailEl && 'value' in emailEl ? String(emailEl.value || '').trim() : '';
      var qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
      var extensionFields = {};
      extFields.forEach(function (f) {
        if (!f || !f.name) return;
        var el = form.elements.namedItem(f.name);
        if (el && 'type' in el) extensionFields[f.name] = fieldValue(el);
      });
      var line = { ProductID: productId, Quantity: qty };
      if (Object.keys(extensionFields).length) {
        line.ExtensionData = { EntityName: config.extensionEntityName, Fields: extensionFields };
      }
      post('/draft', {
        sessionId: sessionId,
        clientSessionKey: sessionKey,
        email: email,
        lines: [line]
      }).then(function (draft) {
        if (!draft || !draft.Success) {
          throw new Error((draft && draft.ErrorMessage) || 'Could not price this checkout.');
        }
        var total = typeof draft.TotalGross === 'number' ? draft.TotalGross : 0;
        totalEl.textContent = 'Total: ' + total.toFixed(2);
        if (!draft.RequiresPayment) {
          status.textContent = 'Completing…';
          return post('/complete', { sessionId: sessionId, clientSessionKey: sessionKey });
        }
        status.textContent = 'Opening payment…';
        return post('/payment-intent', { sessionId: sessionId, clientSessionKey: sessionKey }).then(function (intent) {
          if (!intent || !intent.Success || !intent.ClientSecret) {
            throw new Error((intent && intent.ErrorMessage) || 'Could not start payment.');
          }
          var pk = config.stripePublishableKey;
          if (!pk) {
            throw new Error('This checkout requires card payment. Configure stripePublishableKey on the widget, or embed the checkout widget on a site that already loads Stripe.');
          }
          return loadStripe(pk).then(function (stripeInst) {
            stripe = stripeInst;
            if (!cardElement) {
              var elements = stripe.elements();
              cardElement = elements.create('card');
              cardElement.mount('#mj-co-card');
              status.textContent = 'Enter card details and submit again to pay.';
              submit.textContent = 'Pay';
              submit.disabled = false;
              form.dataset.payReady = '1';
              return { _waitForCard: true };
            }
            status.textContent = 'Confirming payment…';
            return stripe.confirmCardPayment(intent.ClientSecret, {
              payment_method: { card: cardElement, billing_details: { email: email } }
            }).then(function (result) {
              if (result.error) throw new Error(result.error.message || 'Payment failed.');
              status.textContent = 'Completing…';
              return post('/complete', { sessionId: sessionId, clientSessionKey: sessionKey });
            });
          });
        });
      }).then(function (done) {
        if (!done || done._waitForCard) return;
        if (!done.Success) {
          throw new Error(done.ErrorMessage || 'Could not complete checkout.');
        }
        host.innerHTML = '';
        var ok = document.createElement('p');
        ok.className = 'mj-co__ok';
        ok.setAttribute('role', 'status');
        ok.textContent = config.successMessage || ('Thank you. Order ' + (done.OrderNumber || '') + ' is confirmed.');
        host.appendChild(ok);
        if (config.redirectUrl) {
          window.location.href = config.redirectUrl;
        }
      }).catch(function (err) {
        status.textContent = '';
        var existing = form.querySelector('.mj-co__error');
        if (existing) existing.remove();
        var p = document.createElement('p');
        p.className = 'mj-co__error';
        p.setAttribute('role', 'alert');
        p.textContent = err && err.message ? err.message : 'Checkout failed.';
        form.insertBefore(p, submit);
        submit.disabled = false;
      });
    });
  }).catch(function () {
    showError('Checkout is temporarily unavailable. Please try again.');
  });
})();
`;

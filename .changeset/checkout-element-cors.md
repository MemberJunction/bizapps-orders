---
'@mj-biz-apps/orders-server': patch
---

The checkout element bundle (`GET {RootPath}/element/main.js`, and its source map when served) now carries `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`, so a host on another origin can load it with `<script type="module">`. Before, the browser refused the cross-origin module and the widget never rendered. The bundle is public static code; the checkout POST routes keep applying each widget's `allowedOrigins`.

/**
 * @mj-biz-apps/orders-core-entities-server/testing — seams for test harnesses, never for production code.
 *
 * Kept off the package root on purpose (#947 review): the root is what a host imports, and anything
 * there is one autocomplete away from production code. A seam here has to be imported by its
 * subpath, which a reviewer sees, and the package's `exports` map stops a deep import of
 * `dist/isolatedProvider.js` from reaching it any other way.
 */

// Lets isolated work join the transaction an integration check holds. Calling it in production would
// bring back the shared-provider rollback #927 fixed.
export { JoinCallerTransactionForTests } from './isolatedProvider.js';

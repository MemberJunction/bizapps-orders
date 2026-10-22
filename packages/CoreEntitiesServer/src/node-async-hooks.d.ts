/**
 * Declared rather than imported, like `process` in `PaymentProviderResolver.ts`: the shared server
 * tsconfig sets `"types": []`, so this package has no Node typings, and adding `@types/node` would
 * collide with the `declare const process` there. This is the whole surface used, by
 * `isolatedProvider.ts` (#947). Delete it if the package ever takes `@types/node`.
 */
declare module 'node:async_hooks' {
    export class AsyncLocalStorage<T> {
        getStore(): T | undefined;
        run<R>(store: T, callback: () => R): R;
    }
}

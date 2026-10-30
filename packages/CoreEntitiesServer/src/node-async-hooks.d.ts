/**
 * Declared rather than imported because this package does not take `@types/node`: the shared server
 * tsconfig sets `"types": []`. This is the whole surface `isolatedProvider.ts` uses (#947).
 *
 * Delete this file if the package ever takes `@types/node`: it would hide the real
 * `node:async_hooks` typings (a call to anything not declared here, such as `enterWith`, would fail
 * with TS2339).
 */
declare module 'node:async_hooks' {
    export class AsyncLocalStorage<T> {
        getStore(): T | undefined;
        run<R>(store: T, callback: () => R): R;
    }
}
